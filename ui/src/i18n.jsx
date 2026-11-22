// Arabic (right-to-left) and English. Each feature adds its own keys here.
import { createContext, useContext, useEffect, useState } from 'react';
import { readSetting, saveSetting } from './storage.js';

const STRINGS = {
  en: {
    appTagline: 'Coding and AI training for Palestinian refugee youth, connected to paid work.',
    heroEyebrow: 'Learn, then earn',
    heroTitle: 'Training that opens the door to paid work',
    browseCourses: 'Browse courses',
    learning: 'Learning',
    language: 'العربية',
    actingAs: 'Acting as',
    visitor: 'Visitor',
    navHome: 'Home',
    navCourses: 'Courses',
    navTeach: 'My courses',
    systemStatus: 'System status',
    learningService: 'Learning service',
    projectsService: 'Projects service',
    statusOk: 'working',
    statusDown: 'unreachable',
    checking: 'checking…',
    loading: 'Loading…',
    catalogue: 'Course catalogue',
    noCourses: 'No courses yet.',
    allTypes: 'All types',
    module: 'Online module',
    live_class: 'Live class',
    workshop: 'Workshop',
    credits: 'credits',
    passMark: 'Pass mark',
    draft: 'Draft',
    published: 'Published',
    newCourse: 'New course',
    edit: 'Edit',
    delete: 'Delete',
    confirmDelete: 'Delete this course? This cannot be undone.',
    save: 'Save',
    cancel: 'Cancel',
    title: 'Title',
    description: 'Description',
    type: 'Type',
    back: 'Back to courses',
    myCoursesIntro: 'Courses you teach, including drafts.',
    roles: { trainee: 'Trainee', instructor: 'Instructor', company: 'Business', admin: 'Admin' },
  },
  ar: {
    appTagline: 'تدريب على البرمجة والذكاء الاصطناعي للشباب اللاجئين الفلسطينيين، مرتبط بعمل مدفوع.',
    heroEyebrow: 'تعلّم، ثم اكسب',
    heroTitle: 'تدريب يفتح الباب لعمل مدفوع',
    browseCourses: 'تصفّح الدورات',
    learning: 'التعلّم',
    language: 'English',
    actingAs: 'المستخدم الحالي',
    visitor: 'زائر',
    navHome: 'الرئيسية',
    navCourses: 'الدورات',
    navTeach: 'دوراتي',
    systemStatus: 'حالة النظام',
    learningService: 'خدمة التعلم',
    projectsService: 'خدمة المشاريع',
    statusOk: 'تعمل',
    statusDown: 'غير متاحة',
    checking: 'جارٍ الفحص…',
    loading: 'جارٍ التحميل…',
    catalogue: 'كتالوج الدورات',
    noCourses: 'لا توجد دورات بعد.',
    allTypes: 'كل الأنواع',
    module: 'وحدة عبر الإنترنت',
    live_class: 'درس مباشر',
    workshop: 'ورشة عمل',
    credits: 'نقاط',
    passMark: 'علامة النجاح',
    draft: 'مسودة',
    published: 'منشورة',
    newCourse: 'دورة جديدة',
    edit: 'تعديل',
    delete: 'حذف',
    confirmDelete: 'حذف هذه الدورة؟ لا يمكن التراجع عن ذلك.',
    save: 'حفظ',
    cancel: 'إلغاء',
    title: 'العنوان',
    description: 'الوصف',
    type: 'النوع',
    back: 'العودة إلى الدورات',
    myCoursesIntro: 'الدورات التي تدرّسها، بما فيها المسودات.',
    roles: { trainee: 'متدرب', instructor: 'مدرّب', company: 'شركة', admin: 'مشرف' },
  },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => readSetting('lang', 'en'));

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    saveSetting('lang', lang);
  }, [lang]);

  const value = {
    lang,
    toggle: () => setLang((l) => (l === 'ar' ? 'en' : 'ar')),
    t: (key) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key,
  };
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
