-- Forcefully synchronize the API schema cache so Next.js can read the table relationships
NOTIFY pgrst, 'reload schema';
