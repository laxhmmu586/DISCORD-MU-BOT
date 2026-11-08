'use strict';
function bagInfo(sy,box) {
  if(!sy)return null;
  return {source:'SY/BND',hasData:Boolean(sy.bags||box),detailsAvailable:false,
    summary:{flightNo:sy.flightNo,flightDate:sy.flightDate,bags:sy.bags?Number(sy.bags[1]):null,weightKg:sy.bags?Number(sy.bags[2]):null,boardingNumbers:box?.passengers??null,infants:box?.infants??null},
    rushBags:null,notLoadBags:null,unloadBags:[],
    detailMessage:'SY/BND does not provide Rush / Not Load bag tags or remarks.'};
}
module.exports={bagInfo};
