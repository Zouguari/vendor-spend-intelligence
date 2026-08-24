const https = require('https');

async function analyzeVendors(suppliers) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY environment variable is not set in .env');
  }

  // Limit suppliers to 45 items max and compact properties to avoid 413 Request Entity Too Large
  const listToAnalyze = (suppliers || []).slice(0, 45);

  const payloadData = listToAnalyze.map(s => ({
    id: String(s.Supplier || '').trim(),
    name: String(s.SupplierName || s.SupplierFullName || '').trim()
  })).filter(s => s.name.length > 0);

  const systemPrompt = `You are an expert SAP Master Data Analyst specializing in Vendor Master Data Governance and Duplicate Detection.
Analyze the provided list of suppliers and identify probable duplicate groups (suppliers with highly similar names suggesting duplicate creation by error).

CRITICAL REQUIREMENT: Do NOT include thinking process, reasoning steps, <think> tags, or markdown text. Return ONLY a single raw JSON object matching this exact structure:

{
  "duplicate_groups": [
    {
      "supplier_ids": ["1000042", "1000043"],
      "similarity_reason": "Explanation of why these suppliers are likely duplicates",
      "confidence": "High"
    }
  ],
  "total_suppliers_analyzed": ${payloadData.length},
  "summary": "Summary of duplicate analysis findings"
}`;

  const userPrompt = `Suppliers to analyze:\n${JSON.stringify(payloadData)}`;

  const modelsToTry = [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.6-27b'
  ];

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const result = await callGroqModel(apiKey, model, systemPrompt, userPrompt, payloadData.length);
      return result;
    } catch (err) {
      console.warn(`Model ${model} failed: ${err.message}. Trying next model...`);
      lastError = err;
    }
  }

  throw lastError || new Error('All Groq models failed');
}

function callGroqModel(apiKey, model, systemPrompt, userPrompt, totalCount) {
  const bodyPayload = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.1,
    max_tokens: 2048
  };

  const bodyString = JSON.stringify(bodyPayload);

  return new Promise((resolve, reject) => {
    const url = new URL('https://api.groq.com/openai/v1/chat/completions');
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyString)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Groq API (${model}) status ${res.statusCode}: ${data}`));
        }
        try {
          let content = data;
          const parsed = JSON.parse(data);
          content = parsed.choices?.[0]?.message?.content || '';

          // 1. Strip <think>...</think> tags if present
          content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

          // 2. Extract content inside ```json ... ``` if present
          const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
          if (codeBlockMatch) {
            content = codeBlockMatch[1];
          }

          // 3. Find outermost JSON object boundaries { ... }
          const firstBrace = content.indexOf('{');
          const lastBrace = content.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            content = content.substring(firstBrace, lastBrace + 1);
          }

          const resultJson = JSON.parse(content);
          if (!resultJson.total_suppliers_analyzed) {
            resultJson.total_suppliers_analyzed = totalCount;
          }
          if (!resultJson.duplicate_groups) {
            resultJson.duplicate_groups = [];
          }
          if (!resultJson.summary) {
            resultJson.summary = 'Analyse terminée avec succès.';
          }

          // Normalize ID property names if needed
          if (Array.isArray(resultJson.duplicate_groups)) {
            resultJson.duplicate_groups.forEach(g => {
              if (g.ids && !g.supplier_ids) g.supplier_ids = g.ids;
              if (g.supplier_ids) g.supplier_ids = g.supplier_ids.map(id => String(id));
            });
          }

          resolve(resultJson);
        } catch (e) {
          reject(new Error(`Failed to parse Groq response (${model}): ${e.message}`));
        }
      });
    });

    req.on('error', err => reject(err));
    req.write(bodyString);
    req.end();
  });
}

module.exports = { analyzeVendors };
