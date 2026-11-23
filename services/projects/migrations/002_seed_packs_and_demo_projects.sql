-- The three packs from the proposal, and demo projects in different states:
--   1 approved (Ahmad, with a public testimonial), 2 in progress (Ahmad),
--   3 requested (custom, waiting for a quote).
INSERT INTO packs (code, name, summary, delivery_days, setup_fee_jd, price_jd, level_required) VALUES
  ('website', N'One-week website',
   N'A mobile-friendly site of up to 5 pages with a contact form and your opening hours.', 7, 30, 150, 1),
  ('whatsapp-bot', N'WhatsApp order bot',
   N'Customers order from your menu over WhatsApp; you get a daily summary.', 10, 50, 350, 2),
  ('ai-assistant', N'AI reply assistant',
   N'Drafts replies to customer messages in Arabic and English for you to approve.', 14, 80, 500, 3);
GO

INSERT INTO projects (company_id, pack_code, title, goals, features, status, level_required,
  setup_fee_jd, price_jd, trainee_id, rating, testimonial, testimonial_public)
VALUES
  ('company-zaytoun', 'website', N'Zaytoun Bakery website',
   N'Let customers see the menu and order cakes for events.', N'Menu, cake gallery, order form',
   'approved', 1, 30, 150, 'trainee-ahmad', 5,
   N'Ahmad listened carefully and delivered a site our customers love. Orders doubled in a month.', 1),
  ('company-petra', 'website', N'Petra Trails booking page',
   N'Show our hiking tours and take booking requests.', N'Tour list, booking request form',
   'in_progress', 1, 30, 150, 'trainee-ahmad', NULL, NULL, 0),
  ('company-zaytoun', NULL, N'Loyalty card for regular customers',
   N'Reward regulars with a stamp card they keep on their phone.', N'Stamp card, QR scan at the till',
   'requested', NULL, NULL, NULL, NULL, NULL, NULL, 0);

INSERT INTO project_events (project_id, action, from_status, to_status, actor_id) VALUES
  (1, 'quote', 'requested', 'quoted', 'admin-rania'),
  (1, 'accept', 'quoted', 'accepted', 'company-zaytoun'),
  (1, 'assign', 'accepted', 'in_progress', 'admin-rania'),
  (1, 'submit', 'in_progress', 'in_review', 'trainee-ahmad'),
  (1, 'approve', 'in_review', 'approved', 'company-zaytoun'),
  (2, 'quote', 'requested', 'quoted', 'admin-rania'),
  (2, 'accept', 'quoted', 'accepted', 'company-petra'),
  (2, 'assign', 'accepted', 'in_progress', 'admin-rania');

INSERT INTO invoices (project_id, kind, amount_jd, payment_ref) VALUES
  (1, 'setup_fee', 30, 'mock-demo-1'),
  (1, 'project_price', 150, 'mock-demo-2'),
  (2, 'setup_fee', 30, 'mock-demo-3');

INSERT INTO payouts (project_id, trainee_id, amount_jd, jiwar_share_jd) VALUES
  (1, 'trainee-ahmad', 120, 30);

INSERT INTO messages (project_id, author_id, body) VALUES
  (2, 'company-petra', N'Could the booking form ask for the group size?'),
  (2, 'trainee-ahmad', N'Yes, I will add it with a maximum of 12 people per tour.');
