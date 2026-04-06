
-- Delete test AP invoice linked to test vendor
DELETE FROM ap_invoices WHERE id = 'bbf26d50-2a1f-4ec9-9211-2978367beaba';

-- Delete test vendor
DELETE FROM vendors WHERE id = 'd462d721-9ec6-47b1-8a52-8eb2105b1736';

-- Delete test AR invoice
DELETE FROM ar_invoices WHERE id = '453eb392-870a-4b80-8059-93597b2a9252';

-- Delete test customer
DELETE FROM customers WHERE id = 'cc02b585-20bb-4850-8273-054bac5bbb54';
