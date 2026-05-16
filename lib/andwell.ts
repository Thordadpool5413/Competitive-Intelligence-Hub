export type ServiceLine = {
  category: string;
  serviceLine: string;
  description: string;
  subservices: string[];
  safeLanguage: string;
  avoid: string;
  evidence: string;
};

export const andwellCatalog: ServiceLine[] = [
  {
    category: 'At Home Care',
    serviceLine: 'Home Healthcare',
    description: 'Skilled medical care delivered in the home for patients recovering from illness, surgery, hospitalization, rehab, or managing chronic conditions.',
    subservices: ['Skilled nursing','Therapy support','Home health aides','Social work support','Physician coordination','Chronic care','Diabetes management','Fall prevention','Rehabilitation therapy','Wound care','Ostomy care','Infusion therapy','Oncology support','High risk pregnancy care','Pediatric care','Telehealth monitoring','Hospital follow up','Rehab follow up','Homebound patient support'],
    safeLanguage: 'Andwell publicly describes skilled home healthcare with nursing, therapy, aides, social work, chronic care, wound and ostomy care, infusion, oncology support, pediatric care, high risk pregnancy support, and telehealth monitoring.',
    avoid: 'Do not say a competitor cannot provide specialty home health services unless that is confirmed by an approved source.',
    evidence: 'https://andwell.org/health-services/at-home-care/home-healthcare/'
  },
  {
    category: 'At Home Care',
    serviceLine: 'In Home Care Giving',
    description: 'Customized non medical and supportive care that helps older adults remain independent, comfortable, and safe at home.',
    subservices: ['Companion care','Socialization','Activities','Emotional support','Household help','Laundry','Meal support','Errands','Basic household chores','Respite care','Bathing assistance','Grooming assistance','Dressing assistance','Mobility assistance','Specialized condition support','Continuity into skilled care'],
    safeLanguage: 'Andwell publicly describes customized in home caregiving, companion care, household help, respite, personal care, specialized care, and continuity into skilled medical care when needed.',
    avoid: 'Do not present non medical caregiving as skilled nursing or clinical care.',
    evidence: 'https://andwell.org/health-services/at-home-care/at-home-care-giving-caregivers/'
  },
  {
    category: 'At Home Care',
    serviceLine: 'Mobile Wound Care',
    description: 'Home based wound, ostomy, and continence care supported by skilled clinicians, physician coordination, in person care, virtual care, and telehealth where appropriate.',
    subservices: ['Wound care','Skin care','New wound support','Chronic wound support','Complex wound treatment','Wound prevention','Ostomy care','New ostomy support','Complex ostomy support','Pre operative ostomy education','Post operative ostomy education','Continence care','Continence management','Product guidance','Continence exercises','Nutrition guidance','Pain management','Symptom management','Physician coordination','In person visits','Virtual visits','Telehealth visits'],
    safeLanguage: 'Andwell publicly promotes mobile wound, ostomy, and continence care with physician coordination and in person, virtual, and telehealth support.',
    avoid: 'Do not claim competitors lack wound care. Say mobile wound, ostomy, and continence care was not clearly found publicly when appropriate.',
    evidence: 'https://andwell.org/health-services/at-home-care/wound-care/'
  },
  {
    category: 'At Home Care',
    serviceLine: 'Dementia Care Management through GUIDE',
    description: 'Medicare GUIDE dementia care management supporting people living with dementia and family caregivers.',
    subservices: ['Medicare GUIDE','Dementia care management','Caregiver education','Caregiver training','Caregiver emotional support','Home safety planning','Comprehensive assessment','Cognition assessment','Activities of daily living assessment','Dementia stage assessment','Behavioral needs assessment','Psychosocial needs assessment','Advance care planning','Caregiver assessment','Personalized care plan','After hours telephone support','Telephone triage','Regular check ins','Transitional care management','Community resource referral','Medication management','Medication reconciliation','Support groups','One on one caregiver calls','Respite allowance when eligible','Provider referral form','Self referral pathway'],
    safeLanguage: 'Andwell publicly describes Medicare GUIDE dementia care management with caregiver education, care planning, medication reconciliation, after hours support, and respite allowance when eligible.',
    avoid: 'Do not call a competitor GUIDE unless their public information clearly identifies GUIDE or a comparable structured model.',
    evidence: 'https://andwell.org/health-services/at-home-care/dementia-care-management-guide/'
  },
  {
    category: 'Hospice and Palliative Care',
    serviceLine: 'Hospice Home Care',
    description: 'Comfort focused hospice care wherever the patient resides, including pain and symptom management, interdisciplinary care, family education, equipment, medication support, and emotional and spiritual support.',
    subservices: ['Hospice eligibility education','Comfort focused care','Pain management','Symptom management','Counseling','End of life support','Family support','Emotional support','Spiritual support','Grief counseling','Home hospice','Assisted living support','Long term care facility support','Hospital setting support','Medical Director involvement','Primary physician involvement','Nurse practitioner support','Registered nurse care','Hospice aide support','Social work support','Chaplain support','Volunteer support','Medication ordering','Medication delivery','Emergency medication pack when appropriate','Medical equipment','On call registered nurse availability','Nurse triage','Complementary therapies','Reiki','Music','Pet support','Comfort touch','Family education'],
    safeLanguage: 'Andwell publicly describes hospice home care with pain and symptom management, interdisciplinary support, medication and equipment help, nurse availability, and family education.',
    avoid: 'Do not say a competitor offers only routine hospice unless that is supported and approved.',
    evidence: 'https://andwell.org/health-services/hospice-palliative-care/hospice-home-care/'
  },
  {
    category: 'Hospice and Palliative Care',
    serviceLine: 'Hospice House Care',
    description: 'Inpatient hospice house care for hospice patients needing intensive pain and symptom management beyond what can effectively be provided at home.',
    subservices: ['The Hospice House in Auburn','Gosnell Memorial Hospice House in Scarborough','Inpatient hospice facility','Intensive pain management','Intensive symptom management','Terminal illness support','Around the clock care','Physicians','Nurse practitioners','Nurses','Aides','Chaplains','Social workers','Grief counselors','Volunteers','Private suites','Family accommodations','Homemade meals','Sanctuary spaces','Gardens','Reiki','Music volunteers','Therapy dog visits'],
    safeLanguage: 'Andwell publicly promotes two hospice house locations, including Auburn and Gosnell Memorial Hospice House in Scarborough, for intensive pain and symptom management needs.',
    avoid: 'Do not confuse hospice care provided in a facility with provider operated inpatient hospice house care.',
    evidence: 'https://andwell.org/health-services/hospice-palliative-care/hospice-house/'
  },
  {
    category: 'Hospice and Palliative Care',
    serviceLine: 'Palliative Medicine',
    description: 'Serious illness care focused on quality of life, symptom burden, goals of care, emotional support, spiritual support, social advocacy, and support alongside curative treatment.',
    subservices: ['Maine Center for Palliative Medicine','Serious illness support','Quality of life support','Caregiver support','Pain management','Symptom management','Emotional support','Spiritual support','Social advocacy','Goals of care support','Whole person care','Care alongside curative treatment','Physician providers','Nurse practitioner providers','Licensed clinical social workers','Palliative care coordinators'],
    safeLanguage: 'Andwell publicly describes palliative medicine as serious illness care focused on quality of life, symptoms, goals, and support for patients, families, caregivers, and providers.',
    avoid: 'Do not merge hospice and palliative care unless the context supports that distinction.',
    evidence: 'https://andwell.org/health-services/hospice-palliative-care/palliative-medicine/'
  },
  {
    category: 'Hospice and Palliative Care',
    serviceLine: 'Caring Comfort Program',
    description: 'Free non medical serious illness support for people who may not be eligible or ready for hospice and may still be receiving curative treatment.',
    subservices: ['Free serious illness support','Non medical support','Support before hospice eligibility','Support before hospice readiness','Support while curative treatment continues','Family involvement','Trained volunteers','Companionship','Emotional support','Light housekeeping','Food preparation','Errands','Short caregiver breaks','Social worker visit','Community resource review','Chaplain visit','Spiritual support','Anticipatory grief support','Physician updates'],
    safeLanguage: 'Andwell publicly describes Caring Comfort as a free non medical serious illness support program before hospice readiness or eligibility, while curative treatment can continue.',
    avoid: 'Do not describe Caring Comfort as skilled nursing or hospice care.',
    evidence: 'https://andwell.org/health-services/hospice-palliative-care/caring-comfort-program/'
  },
  {
    category: 'Hospice and Palliative Care',
    serviceLine: 'Bereavement Support',
    description: 'Free grief and bereavement support including individual support, groups, children and teen programming, and community support where applicable.',
    subservices: ['Free bereavement services','Grief education','Grief groups','Bereavement professional access','Camp Dragonfly','Children and teen grief retreat','Individual grief support','Phone support','Virtual support','Office based support','Adult bereavement groups','Partner loss support','Sudden or traumatic loss support','Bereaved parent support','Expressive arts grief support'],
    safeLanguage: 'Andwell publicly promotes free bereavement services including grief education, individual support, groups, and Camp Dragonfly for grieving children and teens.',
    avoid: 'Do not assume competitor bereavement support is comparable unless their public information shows specific programs.',
    evidence: 'https://andwell.org/health-services/hospice-palliative-care/bereavement-support/'
  },
  {
    category: 'Community and Behavioral Health',
    serviceLine: 'Community and Behavioral Health',
    description: 'Behavioral health and community support services including counseling, evaluations, care coordination, Behavioral Health Home services, adult services, children services, housing support, and rehabilitative support.',
    subservices: ['Outpatient mental health counseling','Co occurring counseling','Children','Adults','Families','Substance use goals','Office based services','School based services','Telehealth appointments','Individual counseling','Couples counseling','Family counseling','Group counseling','Licensed clinicians','Anxiety management','Anger management','Depression management','Diagnostic assessment','Psychological evaluations','Behavioral Health Home for Children','Behavioral Health Home for Adults','Care coordination','Medical Director access','Advanced Psychiatric Nurse Practitioner access','Nurse Care Navigator access','Family support','Peer support','IEP support','Housing support','Food assistance','Community Care Team','HOME program','Adult Day Programs','Support for intellectual disabilities','Support for autism spectrum disorder','Rehabilitative and Community Support for Children'],
    safeLanguage: 'Andwell publicly describes behavioral health services that include counseling, psychological evaluations, Behavioral Health Home services, community care, adult day programs, and children rehabilitative supports.',
    avoid: 'Do not collapse this full platform into the phrase behavioral therapy.',
    evidence: 'https://andwell.org/health-services/behavioral-health-services/'
  },
  {
    category: 'Therapy Care and Specialty Services',
    serviceLine: 'Pediatric Therapy',
    description: 'Pediatric occupational therapy, physical therapy, and speech language therapy provided in clinic, school, and home settings.',
    subservices: ['Pediatric occupational therapy','Pediatric physical therapy','Pediatric speech language therapy','Clinic based therapy','School based therapy','Home based therapy','Family partnership','Personalized evaluations','Sensory skill support','Daily living skill support','Fine motor support','Functional independence support','School integration','Group sessions','Speech and language evaluations','One on one speech therapy','Communication development','Classroom collaboration'],
    safeLanguage: 'Andwell publicly describes pediatric OT, PT, and speech language therapy in clinic, school, and home settings.',
    avoid: 'Do not assume a competitor pediatric program includes all three disciplines unless stated.',
    evidence: 'https://andwell.org/health-services/therapycare-specialty-services/pediatric-therapy/'
  },
  {
    category: 'Therapy Care and Specialty Services',
    serviceLine: 'Adult Therapy',
    description: 'Outpatient adult PT, OT, and speech language pathology with specialty services including neuro rehab, wheelchair clinic, and pelvic floor therapy.',
    subservices: ['Adult physical therapy','Adult occupational therapy','Adult speech language pathology','One on one care','Post surgery recovery','Illness recovery','Injury recovery','Chronic condition management','Stroke recovery','Parkinsons support','ALS support','MS support','Traumatic brain injury support','Spinal cord injury support','Mobility support','Pelvic health support','Incontinence support','Wheelchair Clinic','Pelvic Floor Therapy','Urinary incontinence support','Pelvic pain support','Prolapse support'],
    safeLanguage: 'Andwell publicly describes outpatient adult PT, OT, SLP, neuro focused therapy, wheelchair clinic, and pelvic floor therapy.',
    avoid: 'Do not assume competitor outpatient therapy matches specialty therapy unless shown publicly.',
    evidence: 'https://andwell.org/health-services/therapycare-specialty-services/adult-therapy/'
  },
  {
    category: 'Therapy Care and Specialty Services',
    serviceLine: 'Audiology',
    description: 'Audiology and hearing challenge support at the Lewiston clinic with referral and direct contact pathways.',
    subservices: ['Audiology services','Hearing challenge support','Hearing loss support','Lewiston clinic location','Insurance plan acceptance','Care Credit acceptance','Doctor referral pathway','Direct contact pathway','Dedicated audiology phone number'],
    safeLanguage: 'Andwell publicly promotes audiology services at the Lewiston clinic with referral or direct contact options.',
    avoid: 'Do not position audiology as available in every county unless service area information confirms it.',
    evidence: 'https://andwell.org/health-services/therapycare-specialty-services/audiology/'
  },
  {
    category: 'Therapy Care and Specialty Services',
    serviceLine: 'Maternal and Child Health',
    description: 'Pediatric home health, medically fragile child support, maternal health, postpartum support, high risk pregnancy support, perinatal hospice, and pediatric in home nursing shifts.',
    subservices: ['Pediatric services birth to age eighteen','Pediatric home health care','Chronic fragile medical conditions','Acute fragile medical conditions','Cardiac birth defects','Cerebral palsy','Genetic conditions','Cancer','Feeding tubes','Failure to thrive','Neurological conditions','Rare diseases','Chronic disease management','Medication instruction','Equipment evaluations','Wound care','Infusion therapy','PICC care and teaching','PORT care and teaching','Feeding support','G Tube care','Diabetes support','Maternal health support','Breastfeeding support','Postpartum support','Safe sleep teaching','Car seat checks','High risk pregnancy care','Perinatal hospice','Pediatric in home nursing shifts','Block time nursing'],
    safeLanguage: 'Andwell publicly describes pediatric home health, medically fragile child care, infusion, PICC and PORT care, G Tube support, maternal health, high risk pregnancy support, and perinatal hospice.',
    avoid: 'Do not claim all maternal services are available statewide unless verified by service area details.',
    evidence: 'https://andwell.org/health-services/therapycare-specialty-services/maternal-child-health/'
  }
];

export const referralAudiences = ['Hospital discharge planner','Case manager','Primary care provider','Specialist','Facility administrator','Assisted living leader','Skilled nursing facility team','Family caregiver','Community partner','Behavioral health provider','Therapy provider'];
