-- Course notes: the material the AI tutor answers from (story #22).
CREATE TABLE course_notes (
  id INT IDENTITY(1, 1) NOT NULL CONSTRAINT pk_course_notes PRIMARY KEY,
  course_id INT NOT NULL CONSTRAINT fk_course_notes_course REFERENCES courses (id),
  title NVARCHAR(200) NOT NULL,
  body NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT df_course_notes_created_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX ix_course_notes_course ON course_notes (course_id);
GO

DECLARE @web INT = (SELECT id FROM courses WHERE title = N'Web basics');
DECLARE @react INT = (SELECT id FROM courses WHERE title = N'React for real projects');
DECLARE @ai INT = (SELECT id FROM courses WHERE title = N'Practical AI');
DECLARE @git INT = (SELECT id FROM courses WHERE title = N'Live class: Git together');

INSERT INTO course_notes (course_id, title, body) VALUES
  (@web, N'How a web page is built',
   N'A web page is an HTML file. HTML describes the structure: headings (h1 to h6), paragraphs (p), links (a), images (img) and lists (ul, ol, li). The browser reads the HTML from top to bottom and draws it. Every page starts with <!doctype html>, then an html element with a head (title, meta tags, links to CSS) and a body (what people see).'),
  (@web, N'Styling with CSS',
   N'CSS controls how HTML looks: colours, fonts, spacing and layout. Put CSS in a separate file and link it in the head with <link rel="stylesheet" href="style.css">. A rule has a selector and declarations, for example: h1 { color: green; font-size: 2rem; }. Use classes (.card) for styles you reuse. Flexbox (display: flex) puts items in a row or column; grid (display: grid) makes rows and columns.'),
  (@web, N'Making pages work on phones',
   N'Most of our clients'' customers use phones. Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the head. Design for a 360 px screen first, then add room for larger screens with a media query: @media (min-width: 720px) { ... }. Use relative units (rem, %) instead of fixed pixel widths, and make images responsive with max-width: 100%.'),
  (@web, N'الصفحة والنموذج',
   N'النموذج (form) يجمع معلومات من الزائر، مثل الاسم ورقم الهاتف. كل حقل هو عنصر input وله label يشرح ما يُكتب فيه. استخدم type="tel" لرقم الهاتف وtype="email" للبريد الإلكتروني حتى يعرض الهاتف لوحة المفاتيح المناسبة. زر الإرسال هو <button type="submit">.'),
  (@react, N'Components and props',
   N'A React component is a function that returns what to show (JSX). Props are the inputs of a component: <ProductCard name="Kaak" price={1.5} />. A component should do one job. Keep components small and reuse them, like the cards of a menu.'),
  (@react, N'State and effects',
   N'State is data that changes while the page is open, created with const [count, setCount] = useState(0). Calling setCount re-renders the component. useEffect runs code after rendering, for example to load data from an API with fetch; give it a list of dependencies so it only runs when they change, and handle loading and error states.'),
  (@ai, N'Writing a good prompt',
   N'A good prompt says who the assistant is, what it should do, what it must not do, and the format of the answer. Give an example of a good answer. For a business reply assistant, include the shop''s opening hours, prices and tone, and tell it to say "I will ask the owner" when it does not know.'),
  (@ai, N'Costs and limits of language models',
   N'Language models are paid per token (pieces of words) for both the input and the output. Keep prompts short, cache answers to questions that repeat, and limit how often each user can call the model. Never put an API key in the browser or in the repository; keep it as a secret on the server.'),
  (@git, N'Branches and pull requests',
   N'Never commit straight to main. Create a branch for each change (git switch -c homework-1), commit small steps with clear messages, push the branch and open a pull request. A reviewer reads the diff, leaves comments on lines, and approves or asks for changes. After approval the branch is merged into main.'),
  (@git, N'الفروع وطلبات الدمج',
   N'لا تعمل مباشرة على الفرع main. أنشئ فرعًا لكل تغيير، واكتب رسالة واضحة لكل إيداع (commit)، ثم افتح طلب دمج (pull request). يقرأ المراجع التغييرات ويعلّق على الأسطر، ثم يوافق أو يطلب تعديلات، وبعد الموافقة يُدمج الفرع في main.');
