using System.Diagnostics;
using Windows.Devices.Enumeration;
using Windows.Devices.Midi;
using Windows.Storage.Streams;
using System.Windows.Threading;
namespace MidiHud.Windows;
internal sealed class MidiInput : IDisposable
{
    private readonly Dispatcher ui;
    private readonly Action<object> emit;
    private readonly Action<string,int[]> observe;
    private readonly DeviceWatcher watcher;
    private readonly Dictionary<string,string> ports=new(StringComparer.Ordinal);
    private MidiInPort? active;
    private string selected="";
    private string connecting="";
    private int epoch;
    private bool disposed;
    private readonly SemaphoreSlim gate=new(1,1);
    public MidiInput(Dispatcher dispatcher, Action<object> send, Action<string,int[]> monitor)
    {
        ui=dispatcher;emit=send;observe=monitor;
        watcher=DeviceInformation.CreateWatcher(MidiInPort.GetDeviceSelector());
        watcher.Added+=(s,d)=>ui.BeginInvoke(new Action(()=>{if(!disposed){ports[d.Id]=d.Name;Publish();}}));
        watcher.Removed+=(s,d)=>ui.BeginInvoke(new Action(()=>{
            if(disposed)return;ports.Remove(d.Id);if(selected==d.Id)ClosePort();Publish();
        }));
        watcher.EnumerationCompleted+=(s,d)=>ui.BeginInvoke(new Action(()=>{if(!disposed)Publish();}));
        watcher.Start();
    }
    private static string Transport(string id)
    {
        var parts=id.Split('\\','#');
        if(parts.Any(part=>part.Equals("USB",StringComparison.OrdinalIgnoreCase)))return "usb";
        if(parts.Any(part=>part.Equals("BTHLEDEVICE",StringComparison.OrdinalIgnoreCase)||part.Equals("BTHENUM",StringComparison.OrdinalIgnoreCase)))return "bluetooth";
        return "unknown";
    }
    private object[] PortStates()=>ports.Select(p=>(object)new {
        id=p.Key,name=p.Value,connected=active!=null&&selected==p.Key,
        connecting=connecting==p.Key,transport=Transport(p.Key)
    }).ToArray();
    public object List()=>new {ports=PortStates(),selected};
    private void Publish()=>emit(new {type="midi.ports",ports=PortStates(),selected});
    public async Task<object> RefreshAsync()
    {
        var entries=await DeviceInformation.FindAllAsync(MidiInPort.GetDeviceSelector());
        if(disposed)throw new InvalidOperationException("Sesión MIDI cerrada.");
        ports.Clear();foreach(var entry in entries)ports[entry.Id]=entry.Name;
        if(selected.Length>0&&!ports.ContainsKey(selected))ClosePort();
        return List();
    }
    public async Task<object> SelectAsync(string id)
    {
        await gate.WaitAsync();
        try{
            if(disposed)throw new InvalidOperationException("Sesión MIDI cerrada.");
            if(active!=null&&selected==id)return List();
            ClosePort();
            if(id.Length==0){Publish();return List();}
            if(!ports.ContainsKey(id))throw new InvalidOperationException("Entrada MIDI no disponible.");
            connecting=id;Publish();
            var generation=epoch;
            var opening=MidiInPort.FromIdAsync(id).AsTask();
            MidiInPort? opened;
            try { opened=await opening.WaitAsync(TimeSpan.FromSeconds(12)); }
            catch(TimeoutException) {
                _=opening.ContinueWith(t=>{if(t.Status==TaskStatus.RanToCompletion)t.Result?.Dispose();},TaskScheduler.Default);
                throw new InvalidOperationException("Tiempo de espera al abrir MIDI.");
            }
            if(opened==null||disposed||generation!=epoch||!ports.ContainsKey(id)){
                opened?.Dispose();throw new InvalidOperationException("No se pudo abrir la entrada MIDI.");
            }
            active=opened;selected=id;active.MessageReceived+=Received;
            Publish();return List();
        }catch(Exception e){if(!disposed){Publish();emit(new{type="midi.error",message=e.Message});}throw;}
        finally{if(connecting.Length>0){connecting="";if(!disposed)Publish();}gate.Release();}
    }
    private void Received(MidiInPort sender,MidiMessageReceivedEventArgs args)
    {
        var raw=args.Message.RawData;
        if(raw.Length==0||raw.Length>65536)return;
        var buffer=new byte[(int)raw.Length];using(var reader=DataReader.FromBuffer(raw))reader.ReadBytes(buffer);
        var bytes=buffer.Select(b=>(int)b).ToArray();
        var timestampMs=Stopwatch.GetTimestamp()*1000.0/Stopwatch.Frequency;
        ui.BeginInvoke(new Action(()=>{
            if(!disposed&&ReferenceEquals(sender,active)){
                observe(ports.GetValueOrDefault(selected,selected),bytes);
                emit(new{type="midi.message",portId=selected,data=bytes,timestampMs});
            }
        }));
    }
    private void ClosePort(){epoch++;var old=active;active=null;selected="";if(old!=null){old.MessageReceived-=Received;old.Dispose();}}
    public void Dispose(){if(disposed)return;disposed=true;ClosePort();try{watcher.Stop();}catch(InvalidOperationException){}}
}
