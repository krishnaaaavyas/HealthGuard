export type Lang = "en" | "hi" | "gu";

export const languages: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "gu", label: "ગુજરાતી" },
];

type Dict = Record<string, { en: string; hi: string; gu: string }>;

export const translations: Dict = {
  appName: { en: "HealthGuard AI", hi: "हेल्थगार्ड एआई", gu: "હેલ્થગાર્ડ એઆઈ" },
  tagline: {
    en: "AI-powered personal health risk assessment",
    hi: "एआई-संचालित व्यक्तिगत स्वास्थ्य जोखिम मूल्यांकन",
    gu: "એઆઈ-સંચાલિત વ્યક્તિગત આરોગ્ય જોખમ મૂલ્યાંકન",
  },
  yourProfile: { en: "Your Profile", hi: "आपकी प्रोफ़ाइल", gu: "તમારી પ્રોફાઇલ" },
  age: { en: "Age", hi: "आयु", gu: "ઉંમર" },
  gender: { en: "Gender", hi: "लिंग", gu: "લિંગ" },
  male: { en: "Male", hi: "पुरुष", gu: "પુરુષ" },
  female: { en: "Female", hi: "महिला", gu: "સ્ત્રી" },
  other: { en: "Other", hi: "अन्य", gu: "અન્ય" },
  height: { en: "Height (cm)", hi: "ऊंचाई (सेमी)", gu: "ઊંચાઈ (સેમી)" },
  weight: { en: "Weight (kg)", hi: "वज़न (किग्रा)", gu: "વજન (કિગ્રા)" },
  smoking: { en: "Smoking", hi: "धूम्रपान", gu: "ધૂમ્રપાન" },
  never: { en: "Never", hi: "कभी नहीं", gu: "ક્યારેય નહીં" },
  former: { en: "Former", hi: "पूर्व", gu: "પૂર્વ" },
  current: { en: "Current", hi: "वर्तमान", gu: "વર્તમાન" },
  exercise: { en: "Exercise frequency", hi: "व्यायाम आवृत्ति", gu: "કસરત આવર્તન" },
  none: { en: "None", hi: "कोई नहीं", gu: "કોઈ નહીં" },
  light: { en: "1-2x / week", hi: "1-2x / सप्ताह", gu: "1-2x / અઠવાડિયું" },
  moderate: { en: "3-4x / week", hi: "3-4x / सप्ताह", gu: "3-4x / અઠવાડિયું" },
  active: { en: "5+ / week", hi: "5+ / सप्ताह", gu: "5+ / અઠવાડિયું" },
  familyHistory: {
    en: "Family history (comma separated)",
    hi: "पारिवारिक इतिहास (अल्पविराम से अलग)",
    gu: "કુટુંબ ઇતિહાસ (અલ્પવિરામથી અલગ)",
  },
  symptoms: {
    en: "Current symptoms",
    hi: "वर्तमान लक्षण",
    gu: "વર્તમાન લક્ષણો",
  },
  analyze: {
    en: "Analyze My Health",
    hi: "मेरा स्वास्थ्य विश्लेषण करें",
    gu: "મારા આરોગ્યનું વિશ્લેષણ કરો",
  },
  analyzing: { en: "Analyzing...", hi: "विश्लेषण हो रहा है...", gu: "વિશ્લેષણ થઈ રહ્યું છે..." },
  riskScores: {
    en: "Lifestyle Risk Scores",
    hi: "जीवनशैली जोखिम स्कोर",
    gu: "જીવનશૈલી જોખમ સ્કોર",
  },
  diabetes: { en: "Diabetes", hi: "मधुमेह", gu: "ડાયાબિટીસ" },
  heartDisease: { en: "Heart Disease", hi: "हृदय रोग", gu: "हृदय रोग" },
  hypertension: { en: "Hypertension", hi: "उच्च रक्तचाप", gu: "हાયપરટેન્શન" },
  bmi: { en: "BMI", hi: "बीएमआई", gu: "બીએમઆઈ" },
  dietPlan: {
    en: "Personalized Diet Plan",
    hi: "व्यक्तिगत आहार योजना",
    gu: "વ્યક્તિગત આહાર યોજના",
  },
  exercisePlan: { en: "Exercise Plan", hi: "व्यायाम योजना", gu: "કસરત યોજના" },
  prevention: { en: "Prevention Tips", hi: "बचाव सुझाव", gu: "નિવારણ સૂચનો" },
  downloadPdf: {
    en: "Download PDF Report",
    hi: "पीडीएफ रिपोर्ट डाउनलोड",
    gu: "પીડીએફ રિપોર્ટ ડાઉનલોડ",
  },
  disclaimer: {
    en: "This tool provides AI-generated estimates for educational purposes only and is not a substitute for professional medical advice.",
    hi: "यह उपकरण केवल शैक्षिक उद्देश्यों के लिए एआई-जनित अनुमान प्रदान करता है और पेशेवर चिकित्सा सलाह का विकल्प नहीं है।",
    gu: "આ સાધન માત્ર શૈક્ષણિક હેતુઓ માટે એઆઈ-જનરેટેડ અંદાજ આપે છે અને વ્યાવસાયિક તબીબી સલાહનો વિકલ્પ નથી.",
  },
  low: { en: "Low", hi: "कम", gu: "ઓછું" },
  moderateRisk: { en: "Moderate", hi: "मध्यम", gu: "મધ્યમ" },
  high: { en: "High", hi: "उच्च", gu: "ઉચ્ચ" },
  overview: { en: "Risk Overview", hi: "जोखिम सिंहावलोकन", gu: "જોખમ વિહંગાવલોકન" },
  riskLevel: { en: "Risk Level", hi: "जोखिम स्तर", gu: "જોખમ સ્તર" },
  overallRisk: { en: "Overall Risk", hi: "समग्र जोखिम", gu: "સમગ્ર જોખમ" },
  heroBadge: { en: "Gemini AI", hi: "जेमिनी एआई", gu: "જેમિની એઆઈ" },
  heroTitle: {
    en: "Understand your health risks in minutes.",
    hi: "मिनटों में अपने स्वास्थ्य जोखिमों को समझें।",
    gu: "મિનિટોમાં તમારા આરોગ્ય જોખમોને સમજો.",
  },
  heroSubtitle: {
    en: "Get personalized lifestyle health risk assessments and AI-generated diet, exercise, and wellness prevention plans tailored to your profile.",
    hi: "अपनी प्रोफ़ाइल के अनुसार व्यक्तिगत जीवनशैली स्वास्थ्य जोखिम आकलन और एआई-जनित आहार, व्यायाम और बचाव योजनाएं प्राप्त करें।",
    gu: "તમારી પ્રોફાઇલ અનુસાર વ્યક્તિગત જીવનશૈલી આરોગ્ય જોખમ મૂલ્યાંકન અને એઆઈ-જનરેટેડ આહાર, કસરત અને નિવારણ યોજનાઓ મેળવો.",
  },
  familyHistoryPh: {
    en: "diabetes, heart disease",
    hi: "मधुमेह, हृदय रोग",
    gu: "ડાયાબિટીસ, હૃદય રોગ",
  },
  symptomsPh: {
    en: "fatigue, headaches…",
    hi: "थकान, सिरदर्द…",
    gu: "થાક, માથાનો દુખાવો…",
  },
  symptomsTooltip: {
    en: "Active symptoms provide direct clinical context on current physiological changes that may indicate glycemic or cardiovascular variance.",
    hi: "सक्रिय लक्षण वर्तमान शारीरिक परिवर्तनों पर प्रत्यक्ष नैदानिक ​​संदर्भ प्रदान करते हैं जो रक्त शर्करा या हृदय संबंधी भिन्नता का संकेत दे सकते हैं।",
    gu: "સક્રિય લક્ષણો વર્તમાન શારીરિક ફેરફારો પર પ્રત્યક્ષ ક્લિનિકલ સંદર્ભ પ્રદાન કરે છે જે રક્ત ખાંડ અથવા હૃદય સંબંધિત ભિન્નતા સૂચવી શકે છે.",
  },
  symptomsHelper: {
    en: "Describe anything you've been noticing for more than two weeks. If you have no symptoms, you can leave this blank.",
    hi: "ऐसी किसी भी चीज़ का वर्णन करें जिसे आप दो सप्ताह से अधिक समय से देख रहे हैं। यदि आपके पास कोई लक्षण नहीं हैं, तो आप इसे खाली छोड़ सकते हैं।",
    gu: "તમે બે અઠવાડિયાથી વધુ સમયથી જે કંઈપણ નોંધી રહ્યા છો તેનું વર્ણન કરો. જો તમને કોઈ લક્ષણો ન હોય, તો તમે તેને ખાલી છોડી શકો છો.",
  },
  // Sidebar keys
  dashboard: { en: "Dashboard", hi: "डैशबोर्ड", gu: "ડેશબોર્ડ" },
  foodScanner: { en: "Food Scanner", hi: "खाद्य स्कैनर", gu: "ફૂડ સ્કેનર" },
  actionPlan: { en: "Action Plan", hi: "कार्य योजना", gu: "એક્શન પ્લાન" },
  progress: { en: "Progress", hi: "प्रगति", gu: "પ્રગતિ" },
  expertReview: { en: "Expert Review", hi: "विशेषज्ञ समीक्षा", gu: "નિષ્ણાત સમીક્ષા" },
  profile: { en: "Profile", hi: "प्रोफ़ाइल", gu: "પ્રોફાઇલ" },
  about: { en: "About", hi: "के बारे में", gu: "વિશે" },
  support: { en: "Support", hi: "सहायता", gu: "સપોર્ટ" },
  healthPlatform: { en: "Health Platform", hi: "स्वास्थ्य मंच", gu: "હેલ્થ પ્લેટફોર્મ" },
  resources: { en: "Resources", hi: "संसाधन", gu: "રિસોર્સિસ" },

  // Dashboard keys
  riskDashboard: { en: "Risk Dashboard", hi: "जोखिम डैशबोर्ड", gu: "જોખમ ડેશબોર્ડ" },
  clinicalEngine: {
    en: "Clinical Risk Engine",
    hi: "नैदानिक ​​जोखिम इंजन",
    gu: "ક્લિનિકલ રિસ્ક એન્જિન",
  },
  lifestyleImpact: {
    en: "Lifestyle Impact Factors",
    hi: "जीवनशैली प्रभाव कारक",
    gu: "જીવનશૈલી અસર પરિબળો",
  },
  actionPrioritiesTitle: {
    en: "Prevention Action Priorities",
    hi: "बचाव कार्रवाई प्राथमिकताएं",
    gu: "નિવારણ એક્શન પ્રાથમિકતાઓ",
  },

  // Scanner keys
  ingredientsScanner: {
    en: "Multimodal Ingredients Scanner",
    hi: "बहुविध घटक स्कैनर",
    gu: "મલ્ટીમોડલ ઇન્ગ્રીડિઅન્ટ્સ સ્કેનર",
  },
  scanPhoto: {
    en: "Scan Ingredient Label",
    hi: "सामग्री लेबल स्कैन करें",
    gu: "સામગ્રી લેબલ સ્કેન કરો",
  },
  textInput: {
    en: "Paste Ingredient List",
    hi: "सामग्री सूची पेस्ट करें",
    gu: "સામગ્રી સૂચિ પેસ્ટ કરો",
  },

  // Action Plan keys
  coachingPlan: {
    en: "Personalized Coaching Plan",
    hi: "व्यक्तिगत कोचिंग योजना",
    gu: "વ્યક્તિગત કોચિંગ પ્લાન",
  },
  preventionStrategies: {
    en: "Clinical Prevention Strategies",
    hi: "नैदानिक ​​बचाव रणनीतियाँ",
    gu: "ક્લિનિકલ પ્રિવેન્શન વ્યૂહરચનાઓ",
  },

  // Assessment keys
  assessmentTitle: {
    en: "Tell us about your health",
    hi: "हमें अपने स्वास्थ्य के बारे में बताएं",
    gu: "અમને તમારા સ્વાસ્થ્ય વિશે કહો",
  },
  progressTracker: {
    en: "Progress Tracker",
    hi: "प्रगति ट्रैकर",
    gu: "પ્રગતિ ટ્રેકર",
  },
  reassessHealthProfile: {
    en: "Reassess Health Profile",
    hi: "स्वास्थ्य प्रोफ़ाइल का पुनर्मूल्यांकन करें",
    gu: "આરોગ્ય પ્રોફાઇલનું પુનઃમૂલ્યાંકન કરો",
  },
  startInitialAssessment: {
    en: "Start Initial Assessment",
    hi: "प्रारंभिक मूल्यांकन शुरू करें",
    gu: "પ્રારંભિક મૂલ્યાંકન શરૂ કરો",
  },
  humanExpertReview: {
    en: "Human Expert Review",
    hi: "मानव विशेषज्ञ समीक्षा",
    gu: "માનવ નિષ્ણાત સમીક્ષા",
  },
  clinicalReviewModule: {
    en: "Clinical Review Module",
    hi: "नैदानिक ​​समीक्षा मॉड्यूल",
    gu: "ક્લિનિકલ સમીક્ષા મોડ્યુલ",
  },
  wellnessTool: {
    en: "Wellness Tool",
    hi: "कल्याण उपकरण",
    gu: "વેલનેસ ટૂલ",
  },
  homeTitle: {
    en: "Identify your chronic health risks in 10 minutes.",
    hi: "10 मिनट में अपने पुराने स्वास्थ्य जोखिमों की पहचान करें।",
    gu: "10 મિનિટમાં તમારા ક્રોનિક હેલ્થ જોખમોને ઓળખો.",
  },
  homeSubtitle: {
    en: "Understand your risk for Type 2 Diabetes, Hypertension, and Heart Disease using simple, everyday indicators. Get personalized, easy-to-follow lifestyle guidance to protect your health.",
    hi: "सरल, रोज़मर्रा के संकेतकों का उपयोग करके टाइप 2 मधुमेह, उच्च रक्तचाप और हृदय रोग के अपने जोखिम को समझें। अपने स्वास्थ्य की रक्षा के लिए व्यक्तिगत, पालन करने में आसान जीवनशैली मार्गदर्शन प्राप्त करें।",
    gu: "સરળ, રોજિંદા સૂચકાંકોનો ઉપયોગ કરીને ટાઇપ 2 ડાયાબિટીસ, હાયપરટેન્શન અને હૃદય રોગના તમારા જોખમને સમજો. તમારા સ્વાસ્થ્યને સુરક્ષિત રાખવા માટે વ્યક્તિગત, સરળ-થી-અનુસરણ જીવનશૈલી માર્ગદર્શન મેળવો.",
  },
  startAssessment: {
    en: "Start Assessment",
    hi: "मूल्यांकन शुरू करें",
    gu: "મૂલ્યાંકન શરૂ કરો",
  },
  learnMore: {
    en: "Learn More",
    hi: "अधिक जानें",
    gu: "વધુ જાણો",
  },
  noMedicalRecords: {
    en: "No medical records required",
    hi: "किसी मेडिकल रिकॉर्ड की आवश्यकता नहीं",
    gu: "કોई મેડિકલ રેકોર્ડની જરૂર નથી",
  },
  privateProcessing: {
    en: "Private on-device processing",
    hi: "निजी ऑन-डिवाइस प्रोसेसिंग",
    gu: "ખાનગી ઓન-ડિવાઈસ પ્રોસેસિંગ",
  },
  whyHealthGuard: {
    en: "Why HealthGuard?",
    hi: "हेल्थगार्ड क्यों?",
    gu: "હેલ્થગાર્ડ શા માટે?",
  },
  healthAssistant: {
    en: "Your Health Assistant",
    hi: "आपका स्वास्थ्य सहायक",
    gu: "તમારા હેલ્થ આસિસ્ટન્ટ",
  },
  healthAssistantDesc: {
    en: "HealthGuard provides an independent, on-device assessment portal that helps you map metabolic and cardiovascular risk factors before symptoms manifest. Our platform offers clear, clinical-guideline-aligned guidance and generative diet and wellness plans tailored to your regional language.",
    hi: "हेल्थगार्ड एक स्वतंत्र, ऑन-डिवाइस मूल्यांकन पोर्टल प्रदान करता है जो लक्षण प्रकट होने से पहले चयापचय और हृदय संबंधी जोखिम कारकों को मैप करने में आपकी सहायता करता है। हमारा मंच स्पष्ट, नैदानिक-दिशानिर्देश-संरेखित मार्गदर्शन और आपकी क्षेत्रीय भाषा के अनुरूप जेनेरेटिव आहार और कल्याण योजनाएं प्रदान करता है।",
    gu: "હેલ્થગાર્ડ એક સ્વતંત્ર, ઓન-ડિવાઈસ મૂલ્યાંકન પોર્ટલ પ્રદાન કરે છે જે લક્ષણો દેખાય તે પહેલાં મેટાબોલિક અને રક્તવાહિની જોખમ પરિબળોને મેપ કરવામાં તમારી મદદ કરે છે. અમારું પ્લેટફોર્મ તમારી પ્રાદેશિક ભાષાને અનુરૂપ સ્પષ્ટ, ક્લિનિકલ-માર્ગદર્શિકા-સંરેખિત માર્ગદર્શન અને જનરેટિવ આહાર અને સુખાકારી યોજનાઓ પ્રદાન કરે છે.",
  },
  howItHelps: {
    en: "How It Helps You",
    hi: "यह आपकी कैसे मदद करता है",
    gu: "તે તમને કેવી રીતે મદદ કરે છે",
  },
  threeStepExplanation: {
    en: "A simple 3-step explanation",
    hi: "एक सरल 3-चरण स्पष्टीकरण",
    gu: "એક સરળ 3-પગલાની સમજૂતી",
  },
  threeStepDesc: {
    en: "HealthGuard is designed to be simple, plain-language, and easy to use.",
    hi: "हेल्थगार्ड को सरल, स्पष्ट भाषा और उपयोग में आसान बनाने के लिए डिज़ाइन किया गया है।",
    gu: "હેલ્થગાર્ડને સરળ, સાદી ભાષા અને ઉપયોગમાં સરળ બનાવવા માટે ડિઝાઇન કરવામાં આવ્યું છે.",
  },
  step1Title: {
    en: "Complete a health assessment",
    hi: "स्वास्थ्य मूल्यांकन पूरा करें",
    gu: "આરોગ્ય મૂલ્યાંકન પૂર્ણ કરો",
  },
  step1Desc: {
    en: "Fill out a simple, 10-minute questionnaire about your everyday habits, nutrition, physical activity, and family health history.",
    hi: "अपनी रोज़मर्रा की आदतों, पोषण, शारीरिक गतिविधि और पारिवारिक स्वास्थ्य इतिहास के बारे में एक सरल, 10 मिनट की प्रश्नावली भरें।",
    gu: "તમારી રોજિંદી આદતો, પોષણ, શારીરિક પ્રવૃત્તિ અને કૌટુંબિક સ્વાસ્થ્ય ઇતિહાસ વિશે એક સરળ, 10-મિનિટની પ્રશ્નાવલી ભરો.",
  },
  step2Title: {
    en: "Analyze lifestyle risk factors",
    hi: "जीवनशैली के जोखिम कारकों का विश्लेषण करें",
    gu: "જીવનશૈલીના જોખમ પરિબળોનું વિશ્લેષણ કરો",
  },
  step2Desc: {
    en: "Get a clear, plain-language summary showing your potential risk scores and what they mean in everyday terms.",
    hi: "संभावित जोखिम स्कोर और रोज़मर्रा के शब्दों में उनके अर्थ दिखाने वाला एक स्पष्ट, सरल-भाषा सारांश प्राप्त करें।",
    gu: "સંભવિત જોખમ સ્કોર્સ અને રોજિંદા શબ્દોમાં તેનો અર્થ શું થાય છે તે દર્શાવતો સ્પષ્ટ, સાદી-ભાષાનો સારાંશ મેળવો.",
  },
  step3Title: {
    en: "Receive personalized prevention guidance",
    hi: "व्यक्तिगत बचाव मार्गदर्शन प्राप्त करें",
    gu: "વ્યક્તિગત નિવારણ માર્ગદર્શન મેળવો",
  },
  step3Desc: {
    en: "Get an AI-designed weekly meal schedule and activity guideline customized specifically to fit your lifestyle.",
    hi: "अपनी जीवनशैली के अनुकूल विशेष रूप से तैयार किया गया एआई-डिज़ाइन किया गया साप्ताहिक भोजन कार्यक्रम और गतिविधि दिशानिर्देश प्राप्त करें।",
    gu: "તમારી જીવનશૈલીને બંધબેસતા ખાસ કસ્ટમાઇઝ્ડ એઆઇ-ડિઝાઇન કરેલ સાપ્તાહિક ભોજન શેડ્યૂલ અને પ્રવૃત્તિ માર્ગદર્શિકા મેળવો.",
  },
  publicHealthEvidence: {
    en: "Public Health Evidence",
    hi: "सार्वजनिक स्वास्थ्य साक्ष्य",
    gu: "જાહેર આરોગ્ય પુરાવા",
  },
  whyPreventionMatters: {
    en: "Why Chronic Disease Prevention Matters",
    hi: "क्रोनिक बीमारी से बचाव क्यों मायने रखता है",
    gu: "ક્રોનિક ડિસીઝ નિવારણ શા માટે મહત્વનું છે",
  },
  whyPreventionMattersDesc: {
    en: "Metabolic and cardiovascular conditions develop gradually. Public health evidence shows that identifying risk factors early enables lifestyle modifications that significantly reduce disease onset.",
    hi: "चयापचय और हृदय संबंधी स्थितियां धीरे-धीरे विकसित होती हैं। सार्वजनिक स्वास्थ्य साक्ष्य बताते हैं कि जोखिम कारकों की जल्दी पहचान करने से जीवनशैली में बदलाव संभव होता है जो बीमारी की शुरुआत को काफी कम करता है।",
    gu: "મેટાબોલિક અને રક્તવાહિની પરિસ્થિતિઓ ધીમે ધીમે વિકસે છે. જાહેર આરોગ્ય પુરાવા દર્શાવે છે કે જોખમી પરિબળોને વહેલા ઓળખવાથી જીવનશૈલીમાં ફેરફાર થાય છે જે રોગની શરૂઆતને નોંધપાત્ર રીતે ઘટાડે છે.",
  },
  preventableHeartConditions: {
    en: "Preventable Heart Conditions",
    hi: "रोके जा सकने वाले हृदय रोग",
    gu: "નિવારી શકાય તેવી હૃદયની સ્થિતિ",
  },
  preventableHeartConditionsDesc: {
    en: "The World Health Organization (WHO) estimates that up to 80% of premature heart attacks and strokes are preventable through risk identification, dietary adjustments, and regular exercise.",
    hi: "विश्व स्वास्थ्य संगठन (डब्ल्यूएचओ) का अनुमान है कि 80% तक असामयिक दिल के दौरे और स्ट्रोक को जोखिम की पहचान, आहार समायोजन और नियमित व्यायाम के माध्यम से रोका जा सकता है।",
    gu: "વર્લ્ડ હેલ્થ ઓર્ગેનાઈઝેશન (WHO) અંદાજ લગાવે છે કે 80% સુધી અકાળ હાર્ટ એટેક અને સ્ટ્રોક જોખમ ઓળખ, આહાર ગોઠવણો અને નિયમિત કસરત દ્વારા નિવારી શકાય છે.",
  },
  undiagnosedHypertension: {
    en: "Undiagnosed Hypertension",
    hi: "अनिर्धारित उच्च रक्तचाप",
    gu: "અનિવાર્ય હાયપરટેન્શન",
  },
  undiagnosedHypertensionDesc: {
    en: "According to WHO reports, approximately 46% of adults with hypertension are unaware they have high blood pressure. Early detection and habit tracking are essential first steps for cardiovascular care.",
    hi: "डब्ल्यूएचओ की रिपोर्टों के अनुसार, उच्च रक्तचाप से पीड़ित लगभग 46% वयस्क इस बात से अनजान हैं कि उन्हें उच्च रक्तचाप है। हृदय की देखभाल के लिए शीघ्र पता लगाना और आदत की ट्रैकिंग आवश्यक पहला कदम है।",
    gu: "WHOના અહેવાલો અનુસાર, હાયપરટેન્શન ધરાવતા આશરે 46% પુખ્તો અજાણ છે કે તેમને હાઈ બ્લડ પ્રેશર છે. કાર્ડિયોવાસ્ક્યુલર કેર માટે પ્રારંભિક શોધ અને આદત ટ્રેકિંગ એ પ્રથમ પગલાં છે.",
  },
  reducedDiabetesRisk: {
    en: "Reduced Diabetes Risk",
    hi: "मधुमेह के जोखिम में कमी",
    gu: "ડાયાબિટીસ જોખમમાં ઘટાડો",
  },
  reducedDiabetesRiskDesc: {
    en: "Clinical research from the landmark Diabetes Prevention Program (DPP) demonstrates that structured lifestyle changes in diet and physical activity can reduce the risk of progressing to type 2 diabetes by 58%.",
    hi: "ऐतिहासिक मधुमेह निवारण कार्यक्रम (डीपीपी) के नैदानिक ​​अनुसंधान से पता चलता है कि आहार और शारीरिक गतिविधि में संरचित जीवनशैली में बदलाव टाइप 2 मधुमेह के बढ़ने के जोखिम को 58% तक कम कर सकते हैं।",
    gu: "ઐતિહાસિક ડાયાબિટીસ પ્રિવેન્શન પ્રોગ્રામ (DPP) ના ક્લિનિકલ સંશોધન દર્શાવે છે કે આહાર અને શારીરિક પ્રવૃત્તિમાં માળખાગત જીવનશૈલીમાં ફેરફાર પ્રકાર 2 ડાયાબિટીસમાં પ્રગતિના જોખમને 58% ઘટાડી શકે છે.",
  },
  assessYourRiskMarkers: {
    en: "Assess Your Risk Markers",
    hi: "अपने जोखिम संकेतकों का आकलन करें",
    gu: "તમારા જોખમ સૂચકાંકોનું મૂલ્યાંકન કરો",
  },
  assessYourRiskMarkersDesc: {
    en: "HealthGuard offers an educational, on-device questionnaire designed to evaluate your risk factors for these conditions and generate personalized guidelines. The assessment is private, free, and takes under 10 minutes.",
    hi: "हेल्थगार्ड इन स्थितियों के लिए आपके जोखिम कारकों का मूल्यांकन करने और व्यक्तिगत दिशानिर्देश उत्पन्न करने के लिए डिज़ाइन की गई एक शैक्षिक, ऑन-डिवाइस प्रश्नावली प्रदान करता है। मूल्यांकन निजी, मुफ़्त है और इसमें 10 मिनट से कम समय लगता है।",
    gu: "હેલ્થગાર્ડ આ પરિસ્થિતિઓ માટે તમારા જોખમી પરિબળોનું મૂલ્યાંકન કરવા અને વ્યક્તિગત માર્ગદર્શિકા જનરેટ કરવા માટે રચાયેલ શૈક્ષણિક, ઓન-ડિવાઈસ પ્રશ્નાવલી આપે છે. મૂલ્યાંકન ખાનગી, મફત છે અને 10 મિનિટથી ઓછો સમય લે છે.",
  },
  startHealthAssessment: {
    en: "Start Health Assessment",
    hi: "स्वास्थ्य मूल्यांकन शुरू करें",
    gu: "આરોગ્ય મૂલ્યાંકન શરૂ કરો",
  },
  readMethodology: {
    en: "Read Methodology",
    hi: "पद्धति पढ़ें",
    gu: "પદ્ધતિ વાંચો",
  },
  backToDashboard: {
    en: "Back to Dashboard",
    hi: "डैशबोर्ड पर वापस जाएं",
    gu: "ડેશબોર્ડ પર પાછા જાઓ",
  },
  viewReport: {
    en: "View Report",
    hi: "रिपोर्ट देखें",
    gu: "રિપોર્ટ જુઓ",
  },
  assessmentRequired: {
    en: "Assessment Required",
    hi: "मूल्यांकन आवश्यक",
    gu: "મૂલ્યાંકન જરૂરી",
  },
  pleaseCompleteAssessment: {
    en: "Please complete your initial health assessment before opening the page.",
    hi: "कृपया पेज खोलने से पहले अपना प्रारंभिक स्वास्थ्य मूल्यांकन पूरा करें।",
    gu: "કૃપા કરીને પૃષ્ઠ ખોલતા પહેલા તમારું પ્રારંભિક આરોગ્ય મૂલ્યાંકન પૂર્ણ કરો.",
  },
  thisWeeksTopActions: {
    en: "This Week's Top Actions",
    hi: "इस सप्ताह की मुख्य कार्रवाइयाँ",
    gu: "આ અઠવાડિયાની ટોચની ક્રિયાઓ",
  },
  activePlan: {
    en: "Active Plan",
    hi: "सक्रिय योजना",
    gu: "સક્રિય યોજના",
  },
  personalizedActionPlanDesc: {
    en: "Your personalized list of highest impact habits, custom regional diet guides, and physical exercise workouts for this week.",
    hi: "इस सप्ताह के लिए आपके उच्चतम प्रभाव वाली आदतों, कस्टम क्षेत्रीय आहार गाइड और शारीरिक व्यायाम वर्कआउट की व्यक्तिगत सूची।",
    gu: "આ અઠવાડિયા માટે તમારા સર્વોચ્ચ અસરવાળી આદતો, કસ્ટમ પ્રાદેશિક આહાર માર્ગદર્શિકાઓ અને શારીરિક કસરત વર્કઆઉટ્સની વ્યક્તિગત સૂચિ.",
  },
  startInitialAssessment: {
    en: "Start Initial Assessment",
    hi: "प्रारंभिक मूल्यांकन शुरू करें",
    gu: "પ્રારંભિક મૂલ્યાંકન શરૂ કરો",
  },
  reassessHealthProfile: {
    en: "Reassess Health Profile",
    hi: "स्वास्थ्य प्रोफ़ाइल का पुनः आकलन करें",
    gu: "આરોગ્ય પ્રોફાઇલનું પુનઃ મૂલ્યાંકન કરો",
  },
  onboardingStatus: {
    en: "Onboarding Status",
    hi: "ऑनबोर्डिंग स्थिति",
    gu: "ઓનબોર્ડિંગ સ્થિતિ",
  },
  healthProfileOnboarding: {
    en: "Health Profile Onboarding",
    hi: "स्वास्थ्य प्रोफ़ाइल ऑनबोर्डिंग",
    gu: "આરોગ્ય પ્રોફાઇલ ઓનબોર્ડિંગ",
  },
  onboardingStatusDesc: {
    en: "Your assessment is used to calculate risk scores and personalize your action plan.",
    hi: "आपके मूल्यांकन का उपयोग जोखिम स्कोर की गणना करने और आपकी कार्य योजना को व्यक्तिगत बनाने के लिए किया जाता है।",
    gu: "તમારા મૂલ્યાંકનનો ઉપયોગ જોખમ સ્કોર્સની ગણતરી કરવા અને તમારી એક્શન પ્લાનને વ્યક્તિગત કરવા માટે થાય છે.",
  },
  quickActions: {
    en: "Quick Actions",
    hi: "त्वरित कार्रवाइयाँ",
    gu: "ઝડપી ક્રિયાઓ",
  },
  signOut: {
    en: "Sign Out",
    hi: "साइन आउट",
    gu: "સાઇન આઉટ",
  },
  healthPlatform: {
    en: "Health Platform",
    hi: "स्वास्थ्य मंच",
    gu: "હેલ્થ પ્લેટફોર્મ",
  },
  resources: {
    en: "Resources",
    hi: "संसाधन",
    gu: "રિસોર્સિસ",
  },
  aboutDesc: {
    en: "Learn more about our methodology and evidence-based medicine.",
    hi: "हमारी कार्यप्रणाली और साक्ष्य-आधारित चिकित्सा के बारे में अधिक जानें।",
    gu: "અમારી પદ્ધતિ અને પુરાવા-આધારિત દવા વિશે વધુ જાણો.",
  },
  faqTitle: {
    en: "Questions.",
    hi: "प्रश्न।",
    gu: "પ્રશ્નો.",
  },
  faqSupportText1: {
    en: "Have other inquiries? Reach out on our ",
    hi: "अन्य पूछताछ है? हमारी ",
    gu: "અન્ય પૂછપરછ છે? અમારા ",
  },
  faqSupportText2: {
    en: " page.",
    hi: " पर संपर्क करें।",
    gu: " પેજ પર સંપર્ક કરો.",
  },
  faq1Q: {
    en: "Is HealthGuard a medical device?",
    hi: "क्या हेल्थगार्ड एक चिकित्सा उपकरण है?",
    gu: "શું હેલ્થગાર્ડ મેડિકલ ડિવાઇસ છે?",
  },
  faq1A: {
    en: "No. HealthGuard is a preventive health information tool. It provides educational risk estimates and lifestyle guidance and is not a substitute for diagnosis, treatment, or professional medical advice.",
    hi: "नहीं। हेल्थगार्ड एक निवारक स्वास्थ्य सूचना उपकरण है। यह शैक्षिक जोखिम अनुमान और जीवन शैली मार्गदर्शन प्रदान करता है और निदान, उपचार या पेशेवर चिकित्सा सलाह का विकल्प नहीं है।",
    gu: "ના. હેલ્થગાર્ડ એ નિવારક આરોગ્ય માહિતી સાધન છે. તે શૈક્ષણિક જોખમ અંદાજ અને જીવનશૈલી માર્ગદર્શન પૂરું પાડે છે અને તે નિદાન, સારવાર અથવા વ્યાવસાયિક તબીબી સલાહનો વિકલ્પ નથી.",
  },
  faq2Q: {
    en: "How accurate is the risk scoring?",
    hi: "जोखिम स्कोरिंग कितना सटीक है?",
    gu: "જોખમ स्कोरिंग कितना सटीक है?",
  },
  faq2A: {
    en: "The scoring uses guideline-aligned risk factors (BMI, age, smoking, exercise, family history). Risk percentages are generated by a clinical AI model and are intended as directional indicators — not clinical diagnoses.",
    hi: "स्कोरिंग दिशानिर्देश-संरेखित जोखिम कारकों (बीएमआई, आयु, धूम्रपान, व्यायाम, पारिवारिक इतिहास) का उपयोग करता है। जोखिम प्रतिशत एक नैदानिक ​​एआई मॉडल द्वारा उत्पन्न होते हैं और दिशात्मक संकेतक के रूप में अभिप्रेत हैं - नैदानिक ​​निदान नहीं।",
    gu: "સ્કોરિંગ માર્ગદર્શિકા-સંરેખિત જોખમ પરિબળો (BMI, ઉંમર, ધૂમ્રપાન, કસરત, કૌટુંબિક ઇતિહાસ) નો ઉપયોગ કરે છે. જોખમની ટકાવારી ક્લિનિકલ એઆઈ મોડેલ દ્વારા જનરેટ કરવામાં આવે છે અને તેનો હેતુ માત્ર માર્ગદર્શક સૂચકાંકો તરીકે છે - ક્લિનિકલ નિદાન નથી.",
  },
  faq3Q: {
    en: "Where is my data stored?",
    hi: "मेरा डेटा कहाँ संग्रहीत है?",
    gu: "મારો ડેટા ક્યાં સંગ્રહિત છે?",
  },
  faq3A: {
    en: "Your assessment data is stored locally on your device by default. Reports you download are generated client-side. We do not sell or share personal health data.",
    hi: "आपका मूल्यांकन डेटा डिफ़ॉल्ट रूप से आपके डिवाइस पर स्थानीय रूप से संग्रहीत किया जाता है। आपके द्वारा डाउनलोड की जाने वाली रिपोर्ट क्लाइंट-साइड उत्पन्न होती हैं। हम व्यक्तिगत स्वास्थ्य डेटा बेचते या साझा नहीं करते हैं।",
    gu: "તમારો મૂલ્યાંકન ડેટા ડિફોલ્ટ રૂપે તમારા ઉપકરણ પર સ્થાનિક રીતે સંગ્રહિત થાય છે. તમે ડાઉનલોડ કરો છો તે અહેવાલો ક્લાયંટ-સાઇડ જનરેટ થાય છે. અમે વ્યક્તિગત આરોગ્ય ડેટા વેચતા કે શેર કરતા નથી.",
  },
  faq4Q: {
    en: "Does it support Indian dietary preferences?",
    hi: "क्या यह भारतीय आहार संबंधी प्राथमिकताओं का समर्थन करता है?",
    gu: "શું તે ભારતીય આહાર પસંદગીઓને સપોર્ટ કરે છે?",
  },
  faq4A: {
    en: "Yes. Diet plans are generated in English, Hindi, or Gujarati and adapt to regional cuisines and vegetarian/non-vegetarian preferences.",
    hi: "हाँ। आहार योजनाएं अंग्रेजी, हिंदी या गुजराती में उत्पन्न होती हैं और क्षेत्रीय व्यंजनों और शाकाहारी/मांसाहारी प्राथमिकताओं के अनुकूल होती हैं।",
    gu: "હા. આહાર યોજનાઓ અંગ્રેજી, હિન્દી અથવા ગુજરાતીમાં જનરેટ થાય છે અને પ્રાદેશિક વાનગીઓ તેમજ શાકાહારી/માસાહારી પસંદગીઓને અનુકૂળ થાય છે.",
  },
  faq5Q: {
    en: "Can I share my report with my doctor?",
    hi: "क्या मैं अपनी रिपोर्ट अपने डॉक्टर के साथ साझा कर सकता हूँ?",
    gu: "શું હું મારો રિપોર્ટ મારા ડૉક્ટર સાથે શેર કરી શકું?",
  },
  faq5A: {
    en: "Absolutely. The Health Report page generates a clinician-friendly PDF you can email, print, or upload to your patient portal.",
    hi: "बिल्कुल। स्वास्थ्य रिपोर्ट पृष्ठ एक चिकित्सक के अनुकूल पीडीएफ उत्पन्न करता है जिसे आप ईमेल, प्रिंट या अपने रोगी पोर्टल पर अपलोड कर सकते हैं।",
    gu: "ચોક્કસ. હેલ્થ રિપોર્ટ પેજ ચિકિત્સક-અનુકૂળ પીડીએફ જનરેટ કરે છે જેને તમે ઇમેઇલ, પ્રિન્ટ અથવા તમારા પેશન્ટ પોર્ટલ પર અપલોડ કરી શકો છો.",
  },
  faq6Q: {
    en: "How often should I reassess?",
    hi: "मुझे कितनी बार पुनर्मूल्यांकन करना चाहिए?",
    gu: "મારે કેટલી વાર પુનઃમૂલ્યાંકન કરવું જોઈએ?",
  },
  faq6A: {
    en: "We recommend reassessing every 4–8 weeks if you're actively working on lifestyle changes, and at least quarterly for general monitoring.",
    hi: "यदि आप सक्रिय रूप से जीवनशैली में बदलाव पर काम कर रहे हैं तो हम हर 4-8 सप्ताह में पुनर्मूल्यांकन करने की सलाह देते हैं, और सामान्य निगरानी के लिए कम से कम त्रैमासिक।",
    gu: "જો તમે સક્રિયપણે જીવનશૈલીમાં ફેરફાર પર કામ કરી રહ્યા હોવ તો અમે દર 4-8 અઠવાડિયે પુનઃમૂલ્યાંકન કરવાની ભલામણ કરીએ છીએ, અને સામાન્ય દેખરેખ માટે ઓછામાં ઓછું ત્રિમાસિક.",
  },
};

import { useState, useEffect, useContext } from "react";
import { useLanguageContext } from "@/contexts/language-context";

export function t(key: keyof typeof translations, lang?: Lang): string {
  let activeLang: Lang = "en";
  try {
    const raw = localStorage.getItem("hg.lang.v1");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed === "en" || parsed === "hi" || parsed === "gu") {
          activeLang = parsed as Lang;
        }
      } catch {
        if (raw === "en" || raw === "hi" || raw === "gu") {
          activeLang = raw as Lang;
        }
      }
    }
  } catch {
    // Ignore localStorage errors
  }

  const currentLang = lang || activeLang;
  return translations[key]?.[currentLang] ?? translations[key]?.en ?? key;
}

export const tr = t;

export function useLanguage(): Lang {
  try {
    const context = useLanguageContext();
    return context.language;
  } catch {
    // Fallback if context is not loaded
    const raw = localStorage.getItem("hg.lang.v1");
    if (!raw) return "en";
    try {
      const parsed = JSON.parse(raw);
      if (parsed === "en" || parsed === "hi" || parsed === "gu") {
        return parsed as Lang;
      }
    } catch {
      if (raw === "en" || raw === "hi" || raw === "gu") {
        return raw as Lang;
      }
    }
    return "en";
  }
}
