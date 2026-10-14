(function(root) {
  const item = (id, section, roles, text, art) => ({id, section, roles:roles.split(','), text, art});
  const arrival = [
    item('a1','Pre-Arrival','driver,spotter','Jet bridge driver and spotter arrive at the gate - 15 minutes prior to the arrival, with their proper Safety PPE.','ppe'),
    item('a2','Pre-Arrival','driver,spotter','Jet bridge driver and spotter have briefed on the Ready, Safe, Go program.','signal'),
    item('a3','Pre-Arrival','driver','Jet bridge driver inspects and ensures the jet bridge controls are properly functioning and the jet bridge wheels are stowed in the box.','wheel-check'),
    item('a4','Pre-Arrival','driver','Jet bridge driver ensures the jet bridge is safe to operate (floor - is clear of all debris - trash, water, any possibility trip, slip or fall) and interior temperature and lighting are in perfect condition.','interior'),
    item('a5','Pre-Arrival','driver','Jet bridge driver checks all jet bridges not used during the operation have been checked, secured, and closed.','bridge'),
    item('a6','Pre-Arrival','driver','Jet bridge driver safely moves the jet bridge cab orientation to avoid any positioning delay.','bridge'),
    item('a7','Pre-Arrival','spotter','Spotter checks for the location of the PBB EMERGENCY STOP BUTTON (if applicable).','external-stop'),
    item('a8','Pre-Arrival','spotter','Spotter inspects the ramp area for obstructions in the jet bridge path.','ramp'),
    item('a9','Pre-Arrival','spotter','Spotter will ensure that the jet bridge canopy and bumper are in good condition. (Any tears or missing pieces are to be reported immediately).','bridge'),
    item('a10','Pre-Arrival','driver','REMOTE BAY OPERATION DRIVER - Once the jet bridge has been extended from its stowed position and parked for the aircraft to be tow-in, the jet driver will do a full walk through from the jet bridge cabin to the entrance of the jet bridge.','interior'),
    item('a11','Arrival','spotter','Spotter has verified that the aircraft has been chocked and free of equipment obstruction.','ramp'),
    item('a12','Arrival','driver','Jet bridge driver receives thumbs up signal "READY" to move the jet bridge.','signal'),
    item('a13','Arrival','spotter','Spotter has doubled checked the surroundings for safety, and signals to the driver with thumbs up and communicates with a thumbs-up "SAFE".','signal'),
    item('a14','Arrival','driver','Jet bridge driver confirms back to the spotter with thumbs up "GO", then rings warning bell three times before moving jet bridge.','signal'),
    item('a15','Arrival','driver','Jet bridge driver moves jet bridge towards aircraft slowly and smoothly while maintaining eye contact with the spotter.','bridge'),
    item('a16','Arrival','driver','Jet bridge driver adjusts the jet bridge floor-level approximately 2" - 2.5" below door seal of the aircraft.','bridge'),
    item('a17','Arrival','driver','DO NOT TOUCH FUSELAGE WITH JET BRIDGE.','bridge'),
    item('a18','Arrival','driver','Driver switch Auto-leveler to "on" position and deploys the canopy.','bridge')
  ];
  const departure = [
    item('d1','Departure','driver','Jet bridge driver follows the handling door closure per carrier.','bridge'),
    item('d2','Departure','driver','Jet bridge driver removes the safety shoe (if applicable) and stores it in the designated space.','bridge'),
    item('d3','Departure','driver','Jet bridge driver places the safety strap and/or closes the roller and or shuts the doors.','interior'),
    item('d4','Departure','driver','The jet bridge driver turns the auto off level on and retracts the canopy.','bridge'),
    item('d5','Departure','driver','Jet bridge driver communicates with the spotter with a thumbs up "READY".','signal'),
    item('d6','Departure','spotter','The spotter has doubled checked the surroundings for safety, and signals to the driver with a thumbs-up "SAFE".','signal'),
    item('d7','Departure','driver','The jet bridge driver confirms with the spotter by signaling thumbs up "GO" and rings warning bell 3 times before moving the jet bridge.','signal'),
    item('d8','Departure','spotter','The spotter is in position observing the detachment of the jet bridge from the aircraft.','ramp'),
    item('d9','Departure','spotter','While the jet bridge is in motion the spotter ensures and monitors that there are no obstructions in the way until the jet bridge is stationed in the designated safety zone with the wheels inside the stow-box.','ramp'),
    item('d10','Departure','driver','Clear jet bridge of trash, water, and debris.','interior'),
    item('d11','Departure','driver','Turn off power.','stop'),
    item('d12','Departure','driver','Ensure all sterile area doors allowing access to the terminal from ramp are securely locked.','interior')
  ];
  arrival.find(x=>x.id==='a1').hidden=true;arrival.find(x=>x.id==='a1').defaultValue='Y';
  arrival.find(x=>x.id==='a5').hidden=true;arrival.find(x=>x.id==='a5').defaultValue='Y';
  arrival.find(x=>x.id==='a2').hidden=true;arrival.find(x=>x.id==='a2').defaultValue='Y';
  arrival.find(x=>x.id==='a10').hidden=true;arrival.find(x=>x.id==='a10').defaultValue='NA';
  departure.find(x=>x.id==='d12').hidden=true;departure.find(x=>x.id==='d12').defaultValue='Y';departure.find(x=>x.id==='d3').hidden=true;departure.find(x=>x.id==='d3').defaultValue='Y';departure.find(x=>x.id==='d1').hidden=true;departure.find(x=>x.id==='d1').defaultValue='Y';
  for(const [id,photo] of Object.entries({a8:'ramp-path-realistic.webp',a9:'canopy-bumper-realistic.webp',d1:'aircraft-door.svg',d3:'safety-strap.svg'})){const row=[...arrival,...departure].find(x=>x.id===id);row.art=null;row.photos=[photo];}
  departure.find(x=>x.id==='d2').photos=['safety-shoe.jpg'];
  departure.find(x=>x.id==='d4').photos=['control-console.jpg'];
  // Short screen prompts are separate from the original checklist/PDF wording.
  const prompts={
  "a1": "Arrive 15 minutes early with safety PPE.",
  "a2": "Review READY / SAFE / GO with your partner.",
  "a3": "Check controls work and wheels are in the stow box.",
  "a4": "Check floor is clear and dry; check lighting and temperature.",
  "a5": "Secure and close all unused jet bridges.",
  "a6": "Position the bridge cab for docking.",
  "a7": "Locate the PBB emergency stop button, if fitted.",
  "a8": "Check the jet bridge travel path is clear.",
  "a9": "Check canopy and bumper; report tears, damage or missing parts.",
  "a10": "Remote bay: walk through the bridge after positioning for tow-in.",
  "a11": "Check aircraft chocks are in place and equipment is clear.",
  "a12": "Receive the READY thumbs-up.",
  "a13": "Double-check the area is safe; signal SAFE.",
  "a14": "Confirm GO and ring the warning bell 3 times.",
  "a15": "Move slowly toward the aircraft; keep eye contact with the spotter.",
  "a16": "Set bridge floor 2–2.5 inches below the aircraft door seal.",
  "a17": "Keep bridge off the fuselage.",
  "a18": "Turn auto-leveler on and deploy canopy.",
  "d1": "Confirm aircraft door is closed per airline procedure.",
  "d2": "Remove safety shoe, if fitted; store it in its holder.",
  "d3": "Set safety strap and close bridge shutters/doors.",
  "d4": "Turn auto-leveler off and retract canopy.",
  "d5": "Signal READY to the spotter.",
  "d6": "Double-check the area is safe; signal SAFE.",
  "d7": "Confirm GO and ring the warning bell 3 times.",
  "d8": "Stand in position to watch bridge detachment.",
  "d9": "Keep the travel path clear until wheels are in the stow box.",
  "d10": "Remove trash, water and debris.",
  "d11": "Turn off power.",
  "d12": "Lock all ramp-to-terminal access doors."
};
  for(const row of [...arrival,...departure])row.prompt=prompts[row.id];
  const data={arrival,departure};
  if(typeof module==='object') module.exports=data; else root.PBB_ITEMS=data;
})(typeof window==='object'?window:globalThis);
