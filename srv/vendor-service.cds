using { API_BUSINESS_PARTNER as external } from './external/API_BUSINESS_PARTNER';

@path: '/odata/v4/vendor-service'
service VendorService {

  type DuplicateGroup {
    supplier_ids      : array of String;
    similarity_reason : String;
    confidence        : String;
  }

  type AIDuplicateAnalysis {
    duplicate_groups         : array of DuplicateGroup;
    total_suppliers_analyzed : Integer;
    summary                  : String;
  }

  type BlockedVendorRisk {
    supplier_id     : String;
    supplier_name   : String;
    blocked_reasons : array of String;
    risk_level      : String;
  }

  type AIBlockedVendorAnalysis {
    blocked_suppliers : array of BlockedVendorRisk;
    total_blocked     : Integer;
    summary           : String;
  }

  @readonly
  entity BusinessPartners as projection on external.A_BusinessPartner {
    key BusinessPartner,
        BusinessPartnerCategory,
        BusinessPartnerFullName,
        BusinessPartnerGrouping,
        BusinessPartnerName,
        BusinessPartnerUUID,
        CreatedByUser,
        CreationDate,
        FirstName,
        LastName,
        OrganizationBPName1,
        Supplier,
        Customer
  };

  @readonly
  entity Suppliers as projection on external.A_Supplier {
    key Supplier,
        SupplierName,
        SupplierFullName,
        CreatedByUser,
        CreationDate,
        PurchasingIsBlocked,
        PostingIsBlocked,
        PaymentIsBlockedForSupplier,
        SupplierAccountGroup,
        VATRegistration,
        Industry
  };

  action analyzeVendorDuplicates() returns AIDuplicateAnalysis;
  action detectBlockedVendorRisks() returns AIBlockedVendorAnalysis;
}
