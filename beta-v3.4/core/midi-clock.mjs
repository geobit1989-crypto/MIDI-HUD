/** Shared receive-only F8 tracker. A TAP label is an inference, never an event. */
export function createClockTracker(){
 let ticks=[],reference=null,streak=0,direction=0,last=null,count=0;
 let view={label:'BPM',receivedBpm:null,clockStatus:'waiting'};
 function reset(status='waiting'){ticks=[];reference=null;streak=0;direction=0;last=null;count=0;view={label:'BPM',receivedBpm:null,clockStatus:status};}
 return {reset,getView:()=>({...view}),timeout(t){if(last!==null&&t-last>1000)reset('lost');return {...view};},
 pulse(t,nominal){
  if(!Number.isFinite(t)||t<0)throw Error('Marca temporal MIDI Clock inválida');
  // Some drivers batch real-time bytes with the same hardware timestamp.
  // Do not turn a batch into an artificial tempo measurement.
  if(last!==null&&t<=last)return {...view};
  if(last!==null&&t-last>1000)reset();
  last=t;ticks.push(t);if(ticks.length>25)ticks.shift();count++;
  view.clockStatus='receiving';
  if(ticks.length===25&&(count-1)%24===0){
   const bpm=60000/(t-ticks[0]);
   if(bpm>=30&&bpm<=300){
    view.receivedBpm=Math.round(bpm*10)/10;
    if(reference===null)reference=bpm;
    else if(Math.abs(bpm-reference)>=2){
     const sign=Math.sign(bpm-reference);streak=sign===direction?streak+1:1;direction=sign;
     if(streak>=2){view.label='TAP';reference=bpm;streak=0;}
    }else{streak=0;direction=0;}
   }
  }
  return {...view};
 }};
}
