/*
 * MIDI HUD — transport-independent connection session.
 * The platform adapter supplies discover/connect/disconnect; this module does
 * not claim native BLE support. Only one active device per app instance.
 */
export function createMidiConnectionSession({adapter, storage, storageKey="hudMidiPreferredDevice", onStatus=()=>{}}) {
  if (!adapter || typeof adapter.connect !== "function" || typeof adapter.discover !== "function")
    throw new TypeError("A MIDI transport adapter with discover/connect is required");
  let state="disconnected", active=null, pending=null, generation=0;
  const emit=(next)=>{state=next; onStatus({status:state, deviceId:active?.id??null});};
  const preferred=()=>{try{return storage?.getItem(storageKey)||null;}catch{return null;}};
  const remember=(id)=>{if(typeof id!=="string"||!id.trim())throw new TypeError("Invalid MIDI device ID");try{storage?.setItem(storageKey,id);}catch{/* A connected input remains usable without persistence. */}};
  async function connect(id) {
    if (!id) return false;
    if (pending) return pending;
    const token=++generation;
    emit("connecting");
    const task=(async()=>{
      try {
        const connection=await adapter.connect(id);
        if(token!==generation){await connection?.disconnect?.();return false;}
        active={id,connection};
        remember(id);
        emit("connected");
        return true;
      }catch(error){
        if(token===generation){active=null;emit("disconnected");}
        return false;
      }finally{if(token===generation)pending=null;}
    })();
    pending=task;
    return task;
  }
  async function start(){
    const id=preferred();
    if(id) return connect(id);
    emit("disconnected");
    return false;
  }
  async function select(id){
    await disconnect();
    return connect(id);
  }
  async function discover(){return adapter.discover();}
  async function disconnect(){
    ++generation; pending=null;
    const previous=active;active=null;emit("disconnected");
    await previous?.connection?.disconnect?.();
  }
  function lost(){
    ++generation;pending=null;active=null;emit("disconnected");
    // The HUD engine is deliberately untouched: no song/state mutation.
  }
  return {start,connect,select,discover,disconnect,lost,retry:()=>connect(preferred()),get status(){return state;},get preferredId(){return preferred();}};
}
