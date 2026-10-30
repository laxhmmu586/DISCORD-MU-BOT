const crypto=require('node:crypto');
// Match the supplied reference order against existing private employee records.
// Store matching digests here rather than copying the private roster into source.
const rules=[
  {
    "group": "Business Manager",
    "entries": [
      [
        "6f021f0268d5dd0d4e286ad5202f57335f2a8cc568704c4f7865c97879443ef8"
      ]
    ]
  },
  {
    "group": "Supervisor",
    "entries": [
      [
        "72835f4d90d14ad55edab110d0186ab71e78abfc5b1f3979e845f2043a7f5851",
        "6bf76462777fe24dede795a6531e04702c1971b2dfa7305dee8c37d514b53047"
      ]
    ]
  },
  {
    "group": "Flight Control",
    "entries": [
      [
        "f484e52ce950d68a2e133309ff4419e0af130b30854095238f2a8e9b6818905b"
      ],
      [
        "055b01fdd201943099d1b56f186e5831e80447800232405de22a23f4fc3606d5",
        "10461affcd210caaaa71afc76c372b2f420ba95ab30e009373ab082a484824fd"
      ],
      [
        "f49cf6f6e854f8c981bb5f2c68abb4526c710a89e97d760e0d3a580bfe11fe78",
        "579db208d86a9f87ceb079340f386b1c08ab7bd9b5b6c89f92fcbe594e5ee737",
        "c9805e841751391ca18d1c3508700975438fe0e86161f2d52e5ade49cbb41776"
      ],
      [
        "a3077623feb160949f5172cf1c6f43b883b6b88101049882b3571ca1dab44e31"
      ]
    ]
  },
  {
    "group": "Bagroom",
    "entries": [
      [
        "b8d784f0f90450d6e8e2db2b55374044d23bd7041934250cec285f69e88c39b1"
      ]
    ]
  },
  {
    "group": "Arrival",
    "entries": [
      [
        "c9850183e888717555aaf2bfd366281e660cd2e716ab7ea4a7a8fd436e540aff"
      ],
      [
        "39dc8f2b92685fb17a495a758346eeff6150be36754c80ba66515e1dabaeffb2"
      ],
      [
        "0522a55e2d5f0993a3d66d28864b2862a7218a75ea7968b075333434404485c3"
      ],
      [
        "599ba25a0d7c7d671bee93172ca7e272fc87f0c0e02e44df9e9436819067ea28"
      ],
      [
        "589393bb78d86834ce7d47f4f4647532452f07dbe5a1a94602811571ebfc4039"
      ]
    ]
  },
  {
    "group": "Check-in",
    "entries": [
      [
        "f6f1cb3e04ff6b2522fdef663d3d85c51062ddb5144fc0d60baaca483fd79ccf"
      ],
      [
        "ebe9ed0054647dedebde910ff7a25e1d906cf94a441263958cfafe09561cbdf4"
      ],
      [
        "083f8ac118ffe64192e1bb17c90ad24eb5da72c3c8d0176c8937ac3276c9e8d6"
      ],
      [
        "cf76b00a85ccd4e1bb37b83b3bcbbc4ade00371ed96ef225d7f6302291d10d7d"
      ],
      [
        "03aa9fa4c94ddaf750178ad1979140097b8f714bab57ee32689beeb08d129e96"
      ],
      [
        "c1ec9573ecd530fd15ae6ce28bc6d7f2c1130e0c5a7fbe6438ce9d52cff5b441"
      ],
      [
        "a838bb4fe21bae31d7fb6b49ffb97e1a0821d5122c8655f621a06bb13eabc822"
      ],
      [
        "96553e1577dac6cf499f8f92a5c6f2a6c22c44a3b11fe17e7ff7e8583cabf0e5"
      ]
    ]
  }
];
const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\([^)]*\)/g,'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join('');
const digest=value=>crypto.createHash('sha256').update(normalize(value)).digest('hex');
function orderRoster(employees,reference=rules){
 return employees.map((employee,index)=>{
  const keys=[digest(employee.name),digest(employee.nickname)];let groupIndex=-1,rank=-1;
  for(let i=0;i<reference.length;i++){const found=reference[i].entries.findIndex(aliases=>aliases.some(key=>keys.includes(key)));if(found>=0){groupIndex=i;rank=found;break;}}
  if(groupIndex<0){if(['Supervisor','Senior Supervisor'].includes(employee.position))groupIndex=1;else if(/Manager/.test(employee.position||''))groupIndex=0;rank=1000+index;}
  return {employee,index,groupIndex:groupIndex<0?reference.length:groupIndex,rank};
 }).sort((a,b)=>a.groupIndex-b.groupIndex||a.rank-b.rank||a.index-b.index).map(item=>({...item.employee,scheduleGroup:reference[item.groupIndex]?.group||'Other LAX / MU staff'}));
}
module.exports={orderRoster,digest};
