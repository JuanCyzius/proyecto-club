// Emoji de bandera a partir del nombre de país del dataset.
// Si no está mapeado, se usa un globo neutro.
const CODES: Record<string, string> = {
  "Argentina":"AR","Brazil":"BR","Brasil":"BR","Spain":"ES","España":"ES",
  "France":"FR","Francia":"FR","Italy":"IT","Italia":"IT","Portugal":"PT",
  "Germany":"DE","Alemania":"DE","Netherlands":"NL","Países Bajos":"NL",
  "England":"GB","Inglaterra":"GB","Belgium":"BE","Bélgica":"BE",
  "Croatia":"HR","Croacia":"HR","Serbia":"RS","Uruguay":"UY",
  "Colombia":"CO","Mexico":"MX","México":"MX","Japan":"JP","Japón":"JP",
  "Korea Republic":"KR","Corea":"KR","Senegal":"SN","Nigeria":"NG",
  "Ghana":"GH","Morocco":"MA","Marruecos":"MA","Norway":"NO","Noruega":"NO",
  "Sweden":"SE","Suecia":"SE","Denmark":"DK","Dinamarca":"DK",
  "Turkey":"TR","Turquía":"TR","Poland":"PL","Polonia":"PL",
  "Czech Republic":"CZ","Chequia":"CZ","Ecuador":"EC","Chile":"CL",
  "Peru":"PE","Perú":"PE","Paraguay":"PY","Venezuela":"VE","Bolivia":"BO",
  "United States":"US","Estados Unidos":"US","Canada":"CA","Canadá":"CA",
  "Scotland":"GB","Wales":"GB","Northern Ireland":"GB",
  "Republic of Ireland":"IE","Irlanda":"IE","Austria":"AT","Suiza":"CH",
  "Switzerland":"CH","Greece":"GR","Grecia":"GR","Ukraine":"UA","Ucrania":"UA",
  "Russia":"RU","Rusia":"RU","Romania":"RO","Rumania":"RO","Hungary":"HU",
  "Australia":"AU","China PR":"CN","China":"CN","Egypt":"EG","Egipto":"EG",
  "Algeria":"DZ","Argelia":"DZ","Tunisia":"TN","Cameroon":"CM","Camerún":"CM",
  "Ivory Coast":"CI","Côte d'Ivoire":"CI","Mali":"ML","Guinea":"GN",
  "Costa Rica":"CR","Jamaica":"JM","Panama":"PA","Panamá":"PA",
  "Honduras":"HN","Slovakia":"SK","Slovenia":"SI","Bosnia and Herzegovina":"BA",
  "Albania":"AL","Finland":"FI","Iceland":"IS","Israel":"IL","Iran":"IR",
  "Saudi Arabia":"SA","Qatar":"QA","New Zealand":"NZ","South Africa":"ZA",
};

export function flagEmoji(nation?: string | null): string {
  if (!nation) return "🌐";
  const code = CODES[nation.trim()];
  if (!code) return "🌐";
  return String.fromCodePoint(
    ...code.split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

/** Nombre de liga acortado para la interfaz. */
export function shortLeague(league?: string | null): string {
  if (!league) return "—";
  return league
    .replace("English Premier League", "Premier League")
    .replace("Spain Primera Division", "LaLiga")
    .replace("Italian Serie A", "Serie A")
    .replace("German 1. Bundesliga", "Bundesliga")
    .replace("French Ligue 1", "Ligue 1")
    .replace("Argentina Primera División", "Liga Argentina")
    .replace("USA Major League Soccer", "MLS")
    .replace("Portuguese Liga ZON SAGRES", "Liga Portugal")
    .replace("Holland Eredivisie", "Eredivisie");
}
