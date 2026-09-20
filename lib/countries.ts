/**
 * Country list for the setup question that drives the speaking accent.
 *
 * The four UK nations are listed separately from the United Kingdom on purpose:
 * this field exists to pick an accent, and a Glasgow accent and a Cardiff accent
 * are not interchangeable. Aliases cover what people actually type, so "USA",
 * "Holland" and "Britain" all land somewhere sensible.
 */

export interface Country {
  name: string;
  aliases?: string[];
}

export const COUNTRIES: Country[] = [
  { name: 'Afghanistan' },
  { name: 'Albania' },
  { name: 'Algeria' },
  { name: 'Andorra' },
  { name: 'Angola' },
  { name: 'Antigua and Barbuda' },
  { name: 'Argentina' },
  { name: 'Armenia' },
  { name: 'Australia', aliases: ['aussie', 'oz'] },
  { name: 'Austria' },
  { name: 'Azerbaijan' },
  { name: 'Bahamas' },
  { name: 'Bahrain' },
  { name: 'Bangladesh' },
  { name: 'Barbados' },
  { name: 'Belarus' },
  { name: 'Belgium' },
  { name: 'Belize' },
  { name: 'Benin' },
  { name: 'Bhutan' },
  { name: 'Bolivia' },
  { name: 'Bosnia and Herzegovina' },
  { name: 'Botswana' },
  { name: 'Brazil' },
  { name: 'Brunei' },
  { name: 'Bulgaria' },
  { name: 'Burkina Faso' },
  { name: 'Burundi' },
  { name: 'Cambodia' },
  { name: 'Cameroon' },
  { name: 'Canada' },
  { name: 'Cape Verde', aliases: ['cabo verde'] },
  { name: 'Central African Republic' },
  { name: 'Chad' },
  { name: 'Chile' },
  { name: 'China' },
  { name: 'Colombia' },
  { name: 'Comoros' },
  { name: 'Congo (Democratic Republic)', aliases: ['drc', 'zaire'] },
  { name: 'Congo (Republic)' },
  { name: 'Costa Rica' },
  { name: "Côte d'Ivoire", aliases: ['ivory coast', 'cote divoire'] },
  { name: 'Croatia' },
  { name: 'Cuba' },
  { name: 'Cyprus' },
  { name: 'Czech Republic', aliases: ['czechia'] },
  { name: 'Denmark' },
  { name: 'Djibouti' },
  { name: 'Dominica' },
  { name: 'Dominican Republic' },
  { name: 'Ecuador' },
  { name: 'Egypt' },
  { name: 'El Salvador' },
  { name: 'England', aliases: ['english'] },
  { name: 'Equatorial Guinea' },
  { name: 'Eritrea' },
  { name: 'Estonia' },
  { name: 'Eswatini', aliases: ['swaziland'] },
  { name: 'Ethiopia' },
  { name: 'Fiji' },
  { name: 'Finland' },
  { name: 'France' },
  { name: 'Gabon' },
  { name: 'Gambia' },
  { name: 'Georgia' },
  { name: 'Germany', aliases: ['deutschland'] },
  { name: 'Ghana' },
  { name: 'Greece' },
  { name: 'Greenland' },
  { name: 'Grenada' },
  { name: 'Guatemala' },
  { name: 'Guinea' },
  { name: 'Guinea-Bissau' },
  { name: 'Guyana' },
  { name: 'Haiti' },
  { name: 'Honduras' },
  { name: 'Hong Kong' },
  { name: 'Hungary' },
  { name: 'Iceland' },
  { name: 'India' },
  { name: 'Indonesia' },
  { name: 'Iran' },
  { name: 'Iraq' },
  { name: 'Ireland', aliases: ['eire', 'republic of ireland'] },
  { name: 'Israel' },
  { name: 'Italy' },
  { name: 'Jamaica' },
  { name: 'Japan' },
  { name: 'Jordan' },
  { name: 'Kazakhstan' },
  { name: 'Kenya' },
  { name: 'Kiribati' },
  { name: 'Kosovo' },
  { name: 'Kuwait' },
  { name: 'Kyrgyzstan' },
  { name: 'Laos' },
  { name: 'Latvia' },
  { name: 'Lebanon' },
  { name: 'Lesotho' },
  { name: 'Liberia' },
  { name: 'Libya' },
  { name: 'Liechtenstein' },
  { name: 'Lithuania' },
  { name: 'Luxembourg' },
  { name: 'Macau' },
  { name: 'Madagascar' },
  { name: 'Malawi' },
  { name: 'Malaysia' },
  { name: 'Maldives' },
  { name: 'Mali' },
  { name: 'Malta' },
  { name: 'Marshall Islands' },
  { name: 'Mauritania' },
  { name: 'Mauritius' },
  { name: 'Mexico' },
  { name: 'Micronesia' },
  { name: 'Moldova' },
  { name: 'Monaco' },
  { name: 'Mongolia' },
  { name: 'Montenegro' },
  { name: 'Morocco' },
  { name: 'Mozambique' },
  { name: 'Myanmar', aliases: ['burma'] },
  { name: 'Namibia' },
  { name: 'Nauru' },
  { name: 'Nepal' },
  { name: 'Netherlands', aliases: ['holland', 'dutch'] },
  { name: 'New Zealand', aliases: ['kiwi', 'aotearoa'] },
  { name: 'Nicaragua' },
  { name: 'Niger' },
  { name: 'Nigeria' },
  { name: 'North Korea' },
  { name: 'North Macedonia', aliases: ['macedonia'] },
  { name: 'Northern Ireland', aliases: ['ulster'] },
  { name: 'Norway' },
  { name: 'Oman' },
  { name: 'Pakistan' },
  { name: 'Palau' },
  { name: 'Palestine' },
  { name: 'Panama' },
  { name: 'Papua New Guinea' },
  { name: 'Paraguay' },
  { name: 'Peru' },
  { name: 'Philippines' },
  { name: 'Poland' },
  { name: 'Portugal' },
  { name: 'Puerto Rico' },
  { name: 'Qatar' },
  { name: 'Romania' },
  { name: 'Russia' },
  { name: 'Rwanda' },
  { name: 'Saint Kitts and Nevis' },
  { name: 'Saint Lucia' },
  { name: 'Saint Vincent and the Grenadines' },
  { name: 'Samoa' },
  { name: 'San Marino' },
  { name: 'São Tomé and Príncipe', aliases: ['sao tome'] },
  { name: 'Saudi Arabia' },
  { name: 'Scotland', aliases: ['scottish', 'scots'] },
  { name: 'Senegal' },
  { name: 'Serbia' },
  { name: 'Seychelles' },
  { name: 'Sierra Leone' },
  { name: 'Singapore' },
  { name: 'Slovakia' },
  { name: 'Slovenia' },
  { name: 'Solomon Islands' },
  { name: 'Somalia' },
  { name: 'South Africa' },
  { name: 'South Korea', aliases: ['korea'] },
  { name: 'South Sudan' },
  { name: 'Spain', aliases: ['espana'] },
  { name: 'Sri Lanka' },
  { name: 'Sudan' },
  { name: 'Suriname' },
  { name: 'Sweden' },
  { name: 'Switzerland' },
  { name: 'Syria' },
  { name: 'Taiwan' },
  { name: 'Tajikistan' },
  { name: 'Tanzania' },
  { name: 'Thailand' },
  { name: 'Timor-Leste', aliases: ['east timor'] },
  { name: 'Togo' },
  { name: 'Tonga' },
  { name: 'Trinidad and Tobago' },
  { name: 'Tunisia' },
  { name: 'Turkey', aliases: ['turkiye'] },
  { name: 'Turkmenistan' },
  { name: 'Tuvalu' },
  { name: 'Uganda' },
  { name: 'Ukraine' },
  { name: 'United Arab Emirates', aliases: ['uae', 'dubai', 'abu dhabi'] },
  { name: 'United Kingdom', aliases: ['uk', 'britain', 'great britain', 'gb'] },
  { name: 'United States', aliases: ['usa', 'us', 'america', 'united states of america'] },
  { name: 'Uruguay' },
  { name: 'Uzbekistan' },
  { name: 'Vanuatu' },
  { name: 'Vatican City', aliases: ['holy see'] },
  { name: 'Venezuela' },
  { name: 'Vietnam' },
  { name: 'Wales', aliases: ['welsh', 'cymru'] },
  { name: 'Yemen' },
  { name: 'Zambia' },
  { name: 'Zimbabwe' },
];

/** Lowercase, strip accents, so "cote" finds "Côte d'Ivoire". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '');
}

/**
 * Every character of the query appears in order in the target. Tighter runs
 * score higher, so "unkin" ranks United Kingdom above a scattered match.
 */
function subsequenceScore(query: string, target: string): number {
  let ti = 0;
  let runs = 0;
  let lastMatched = -2;

  for (let qi = 0; qi < query.length; qi += 1) {
    const found = target.indexOf(query[qi], ti);
    if (found === -1) return 0;
    if (found !== lastMatched + 1) runs += 1;
    lastMatched = found;
    ti = found + 1;
  }

  // Fewer runs means the letters sat together.
  return Math.max(1, 20 - runs * 3);
}

function scoreTarget(query: string, target: string): number {
  if (target === query) return 100;
  if (target.startsWith(query)) return 85;
  if (target.split(' ').some((word) => word.startsWith(query))) return 70;
  if (target.includes(query)) return 55;
  return subsequenceScore(query, target);
}

function scoreCountry(query: string, country: Country): number {
  let best = scoreTarget(query, normalize(country.name));
  for (const alias of country.aliases ?? []) {
    // An alias hit is still a real hit, just a slightly weaker signal than the
    // country's own name.
    best = Math.max(best, scoreTarget(query, normalize(alias)) - 5);
  }
  return best;
}

/**
 * The device's own region, as a name from the list above, so the country
 * question can arrive already answered and the common case is one tap.
 *
 * This reads the region the iPad is already set to, not GPS: no permission
 * prompt, nothing sent anywhere, and it is a suggestion the caregiver types
 * over if it is wrong. Anything that does not match the list exactly returns
 * null, because a confidently wrong accent is worse than an empty field.
 */
export function guessCountryFromDevice(): string | null {
  if (typeof navigator === 'undefined') return null;

  const tags = [...(navigator.languages ?? []), navigator.language].filter(Boolean);

  for (const tag of tags) {
    let region: string | undefined;
    try {
      region = new Intl.Locale(tag).region ?? undefined;
    } catch {
      region = tag.split('-')[1];
    }
    if (!region) continue;

    let regionName: string | undefined;
    try {
      regionName = new Intl.DisplayNames(['en'], { type: 'region' }).of(region.toUpperCase());
    } catch {
      regionName = undefined;
    }
    if (!regionName) continue;

    const wanted = normalize(regionName);
    const match = COUNTRIES.find(
      (country) =>
        normalize(country.name) === wanted ||
        (country.aliases ?? []).some((alias) => normalize(alias) === wanted),
    );
    if (match) return match.name;
  }

  return null;
}

/** Ranked matches. An empty query returns the whole list, alphabetically. */
export function searchCountries(query: string): Country[] {
  const q = normalize(query.trim());
  if (!q) return COUNTRIES;

  return COUNTRIES.map((country) => ({ country, score: scoreCountry(q, country) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.country.name.localeCompare(b.country.name))
    .map((entry) => entry.country);
}
