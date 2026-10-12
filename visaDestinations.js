// Country/territory codes are deliberately distinct from airport codes and from mainland China.
const airportsByCountry={
  CHN:['PVG','SHA','HUZ','KHN'],
  USA:['LAX','SFO','JFK','EWR','SEA','ORD','IAD','ATL','DFW','IAH','BOS','MIA','HNL'],
  CAN:['YYZ','YVR','YUL','YYC','YOW'],GBR:['LHR','LGW','MAN','EDI'],FRA:['CDG','ORY','NCE'],
  AUS:['SYD','MEL','BNE','PER','ADL'],NZL:['AKL','CHC','WLG'],DEU:['FRA','MUC','BER'],ITA:['FCO','MXP','VCE'],ESP:['MAD','BCN'],
  JPN:['NRT','HND','KIX','NGO','FUK','CTS'],KOR:['ICN','GMP','PUS'],SGP:['SIN'],MYS:['KUL','PEN','BKI','KCH'],
  THA:['BKK','DMK','CNX','HKT'],VNM:['SGN','HAN','DAD'],IND:['DEL','BOM','BLR','MAA','CCU'],
  KAZ:['ALA','NQZ'],RUS:['SVO','DME','VKO','LED'],MEX:['MEX','CUN','TIJ'],PER:['LIM'],CHL:['SCL'],
  COL:['BOG','MDE'],CRI:['SJO','LIR'],GTM:['GUA'],KHM:['SAI','KTI','PNH'],PHL:['MNL','CEB'],LKA:['CMB'],JAM:['KIN','MBJ'],
  TWN:['TPE','TSA','KHH'],HKG:['HKG'],MAC:['MFM'],ARE:['DXB','AUH'],QAT:['DOH'],TUR:['IST','SAW'],IDN:['CGK','DPS'],
  NLD:['AMS'],CHE:['ZRH','GVA'],ZAF:['JNB','CPT'],ETH:['ADD'],ARM:['EVN'],ALB:['TIA']
};
const airportCountries=new Map(Object.entries(airportsByCountry).flatMap(([country,airports])=>airports.map(a=>[a,country])));
const countryCodes=new Set(['CHN',...Object.keys(airportsByCountry)]);
function countryForAirport(airport){return airportCountries.get(String(airport||'').toUpperCase())||'UNK';}
module.exports={countryForAirport,countryCodes};
