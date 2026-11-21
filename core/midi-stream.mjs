/** One MIDI 1.0 byte stream per input. No output, SysEx or musical logic. */
export function createMidiParser(){
 let status=null,data=[],sysex=false,remaining=0;
 return (input,timestampMs=performance.now())=>{
  const events=[];
  for(const byte of input||[]){
   if(!Number.isInteger(byte)||byte<0||byte>255)continue;
   if(byte>=0xf8){if(byte===0xf8)events.push({type:'MIDI_CLOCK',timestampMs});continue;}
   if(byte&0x80){
    data=[];
    if(byte>=0xf0){status=null;sysex=byte===0xf0;remaining=byte===0xf2?2:[0xf1,0xf3].includes(byte)?1:0;}
    else{status=byte;sysex=false;remaining=0;}
    continue;
   }
   if(sysex)continue;if(remaining){remaining--;continue;}if(status===null)continue;
   data.push(byte);const kind=status&0xf0,n=[0xc0,0xd0].includes(kind)?1:2;
   if(data.length===n){
    const channel=(status&15)+1;
    if(kind===0xb0)events.push({type:'MIDI_CC',channel,cc:data[0],value:data[1]});
    if(kind===0xc0)events.push({type:'MIDI_PC',channel,program:data[0]});
    data=[];
   }
  }
  return events;
 };
}
