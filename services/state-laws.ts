export type StateLawSummary = {
  stateCode: string;
  stateName: string;
  legalLimit: string;
  testConsequences: string;
  licenseSuspension: string;
  duiFine: string;
  sourceLabel: string;
  sourceUrl: string;
  lastReviewed: string;
};

export type LegalHelpContact = {
  stateCode: string;
  label: string;
  phone: string;
  url: string;
  note: string;
};

export const STATE_NAME_TO_CODE: Record<string, string> = {
  Alabama: 'AL',
  Alaska: 'AK',
  Arizona: 'AZ',
  Arkansas: 'AR',
  California: 'CA',
  Colorado: 'CO',
  Connecticut: 'CT',
  Delaware: 'DE',
  Florida: 'FL',
  Georgia: 'GA',
  Hawaii: 'HI',
  Idaho: 'ID',
  Illinois: 'IL',
  Indiana: 'IN',
  Iowa: 'IA',
  Kansas: 'KS',
  Kentucky: 'KY',
  Louisiana: 'LA',
  Maine: 'ME',
  Maryland: 'MD',
  Massachusetts: 'MA',
  Michigan: 'MI',
  Minnesota: 'MN',
  Mississippi: 'MS',
  Missouri: 'MO',
  Montana: 'MT',
  Nebraska: 'NE',
  Nevada: 'NV',
  'New Hampshire': 'NH',
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'North Dakota': 'ND',
  Ohio: 'OH',
  Oklahoma: 'OK',
  Oregon: 'OR',
  Pennsylvania: 'PA',
  'Rhode Island': 'RI',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  Tennessee: 'TN',
  Texas: 'TX',
  Utah: 'UT',
  Vermont: 'VT',
  Virginia: 'VA',
  Washington: 'WA',
  'West Virginia': 'WV',
  Wisconsin: 'WI',
  Wyoming: 'WY',
};

export const STATE_CODE_TO_NAME = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name])
) as Record<string, string>;

const STATE_LAWS: Record<string, StateLawSummary> = {
  IA: {
    stateCode: 'IA',
    stateName: 'Iowa',
    legalLimit: '.08 BAC for adults; .02 zero-tolerance threshold for drivers under 21.',
    testConsequences:
      'Iowa implied consent: refusing a chemical test or testing at/above the legal limit can trigger DOT revocation separate from court.',
    licenseSuspension:
      'First test failure: 180-day revocation. First refusal: 1-year revocation.',
    duiFine:
      'First OWI fine: $1,250; court may waive up to $625 in some temporary restricted license cases.',
    sourceLabel: 'Iowa DOT and Iowa Legislative Services Agency OWI guide',
    sourceUrl: 'https://www.legis.iowa.gov/docs/central/guides/owi.pdf',
    lastReviewed: 'May 2026',
  },
  IN: {
    stateCode: 'IN',
    stateName: 'Indiana',
    legalLimit: '.08 BAC for adults; .02 zero-tolerance threshold for drivers under 21.',
    testConsequences:
      'Indiana implied consent: failing a chemical test or refusing a requested chemical test can trigger BMV/court license consequences separate from the criminal case.',
    licenseSuspension:
      'Chemical test failure: 180-day suspension. Refusal: suspension can be up to 2 years.',
    duiFine:
      'A first OWI at .08-.14 BAC is generally a Class C misdemeanor with a fine up to $500; .15+ or endangerment can raise exposure up to $5,000.',
    sourceLabel: 'Indiana CJI and Indiana BMV suspension guidance',
    sourceUrl: 'https://www.in.gov/cji/traffic-safety/Impaired-Driving/',
    lastReviewed: 'May 2026',
  },
};

export function getStateLawSummary(stateCode?: string | null) {
  if (!stateCode) return null;
  return STATE_LAWS[stateCode.toUpperCase()] ?? null;
}

export function getDuiStatsForState(stateCode: string) {
  if (stateCode === 'IA') {
    return {
      legalLimit: '.08',
      fine: '$1,250',
      suspension: '180d/1y',
    };
  }

  if (stateCode === 'IN') {
    return {
      legalLimit: '.08',
      fine: '$500+',
      suspension: '180d/2y',
    };
  }

  return null;
}

const LEGAL_HELP_CONTACTS: Record<string, LegalHelpContact> = {
  IA: {
    stateCode: 'IA',
    label: 'Iowa State Bar Association Find-A-Lawyer',
    phone: '515-243-3179',
    url: 'https://www.iowabar.org/?pg=Find-A-LawyerHP',
    note: 'Use this referral/directory resource to ask for an OWI/DUI attorney and compare consultation fees.',
  },
  IN: {
    stateCode: 'IN',
    label: 'Indiana State Bar Association',
    phone: '317-639-5465',
    url: 'https://www.inbar.org/general/custom.asp?page=getlegalhelp',
    note: 'Indiana State Bar points users to legal-help and lawyer-locator resources; ask specifically for OWI/DUI help.',
  },
};

export function getLegalHelpContact(stateCode?: string | null) {
  if (!stateCode) return null;
  return LEGAL_HELP_CONTACTS[stateCode.toUpperCase()] ?? null;
}
