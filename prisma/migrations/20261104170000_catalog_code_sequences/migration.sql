CREATE SEQUENCE IF NOT EXISTS product_code_seq AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS service_code_seq AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;

SELECT setval(
  'product_code_seq',
  COALESCE((SELECT MAX(SUBSTRING("code" FROM 6)::BIGINT) + 1 FROM "Product" WHERE "code" ~ '^PROD-[0-9]+$'), 1),
  false
);

SELECT setval(
  'service_code_seq',
  COALESCE((SELECT MAX(SUBSTRING("code" FROM 6)::BIGINT) + 1 FROM "Service" WHERE "code" ~ '^SERV-[0-9]+$'), 1),
  false
);
