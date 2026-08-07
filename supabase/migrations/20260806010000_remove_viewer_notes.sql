-- Removes the viewer_notes feature entirely. No clinical-documentation
-- surface belongs in this app -- this table let a viewer write freeform
-- notes about the person they were viewing, which starts to look like
-- clinical charting and works against staying outside HIPAA
-- business-associate territory. Dropping the table drops its policies too.
drop table if exists viewer_notes;
