require('dotenv').config();
const cds = require('@sap/cds');
const { analyzeVendors } = require('./vendor-ai-analysis');

module.exports = cds.service.impl(async function () {
  let bp;
  const getBp = async () => {
    if (!bp) {
      bp = await cds.connect.to('API_BUSINESS_PARTNER');
    }
    return bp;
  };

  this.on('READ', 'BusinessPartners', async (req) => {
    const service = await getBp();
    const limit = req.query.SELECT?.limit?.rows?.val || 100;
    return service.run(SELECT.from(service.entities.A_BusinessPartner).where({ Supplier: { '<>': '' } }).limit(limit));
  });

  this.on('READ', 'Suppliers', async (req) => {
    const service = await getBp();
    const limit = req.query.SELECT?.limit?.rows?.val || 1000;

    // Check query parameters: search, $search, or OData $filter
    const searchParam = req.req?.query?.search || req.req?.query?.['$search'];

    let query = SELECT.from(service.entities.A_Supplier);

    if (req.query.SELECT?.where) {
      query.where(req.query.SELECT.where);
    } else if (searchParam) {
      const cleanParam = searchParam.replace(/'/g, "''");
      query.where(`contains(SupplierName, '${cleanParam}') or Supplier = '${cleanParam}'`);
    }

    query.limit(limit);
    return service.run(query);
  });

  this.on('analyzeVendorDuplicates', async (req) => {
    const service = await getBp();
    // 1. Fetch current real suppliers from S/4HANA Cloud
    const suppliers = await service.run(SELECT.from(service.entities.A_Supplier).limit(100));
    // 2. Call AI analysis module
    const analysisResult = await analyzeVendors(suppliers);
    // 3. Return structured AI analysis
    return analysisResult;
  });

  this.on('detectBlockedVendorRisks', async (req) => {
    const service = await getBp();
    let suppliers;
    try {
      suppliers = await service.run(
        SELECT.from(service.entities.A_Supplier)
          .where(`PurchasingIsBlocked = true or PostingIsBlocked = true or PaymentIsBlockedForSupplier = true`)
          .limit(1000)
      );
    } catch (e) {
      suppliers = await service.run(SELECT.from(service.entities.A_Supplier).limit(1000));
    }

    const isTruthy = (val) => val === true || val === 'X' || val === 'true' || val === 1 || val === '1';

    const blockedSuppliers = [];

    for (const s of suppliers) {
      const isPurchasingBlocked = isTruthy(s.PurchasingIsBlocked);
      const isPostingBlocked = isTruthy(s.PostingIsBlocked);
      const isPaymentBlocked = isTruthy(s.PaymentIsBlockedForSupplier);

      if (isPurchasingBlocked || isPostingBlocked || isPaymentBlocked) {
        const reasons = [];
        if (isPurchasingBlocked) reasons.push('Purchasing');
        if (isPostingBlocked) reasons.push('Posting');
        if (isPaymentBlocked) reasons.push('Payment');

        // Risk level: High if 2 or more block types, Medium if 1 block type
        const riskLevel = reasons.length >= 2 ? 'High' : 'Medium';

        blockedSuppliers.push({
          supplier_id: String(s.Supplier || '').trim(),
          supplier_name: String(s.SupplierName || s.SupplierFullName || '—').trim(),
          blocked_reasons: reasons,
          risk_level: riskLevel
        });
      }
    }

    return {
      blocked_suppliers: blockedSuppliers,
      total_blocked: blockedSuppliers.length,
      summary: `Analyse terminée : ${blockedSuppliers.length} fournisseur(s) avec restriction(s) de blocage identifié(s).`
    };
  });
});
