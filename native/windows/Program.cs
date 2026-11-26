using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Win32;
namespace MidiHud.Windows;
internal static class Program
{
    [STAThread] public static void Main(){var app=new Application{ShutdownMode=ShutdownMode.OnMainWindowClose};app.Run(new HudWindow());}
}
internal sealed class HudWindow : Window
{
    const string Origin="https://midihud.local",Prefix="/windows-qa/";
    private readonly WebView2 web=new();
    private readonly string dataDir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"MIDI HUD","WindowsQA");
    private readonly string assets=Path.Combine(AppContext.BaseDirectory,"Web");
    private MidiInput? midi;
    private ControllerMonitor? monitor;
    private CoreWebView2? core;
    private long page;
    private bool closed;
    private static bool Local(string? raw)=>Uri.TryCreate(raw,UriKind.Absolute,out var u)&&u.Scheme=="https"&&u.Host=="midihud.local"&&u.IsDefaultPort&&u.UserInfo.Length==0&&u.AbsolutePath.StartsWith(Prefix,StringComparison.Ordinal)&&!Uri.UnescapeDataString(u.AbsolutePath).Contains('\\')&&!Uri.UnescapeDataString(u.AbsolutePath).Split('/').Any(x=>x is "." or "..");
    public HudWindow()
    {
        Title="MIDI HUD";Width=1200;Height=820;MinWidth=500;MinHeight=440;
        var iconPath=Path.Combine(AppContext.BaseDirectory,"hud.ico");
        if(File.Exists(iconPath)) Icon=System.Windows.Media.Imaging.BitmapFrame.Create(new Uri(iconPath));
        var panel=new DockPanel();var menu=new Menu();
        var manager=new MenuItem{Header="Controller Manager"};
        manager.Click+=(_,_)=>OpenController();
        var about=new MenuItem{Header="Acerca de"};
        about.Click+=(_,_)=>MessageBox.Show(this,"MIDI HUD — Windows Alpha 0.1\nEntorno de pruebas.","MIDI HUD");
        menu.Items.Add(manager);menu.Items.Add(about);DockPanel.SetDock(menu,Dock.Top);
        panel.Children.Add(menu);panel.Children.Add(web);Content=panel;
        Loaded+=async(_,_)=>await InitializeAsync();
        Closed+=(_,_)=>{closed=true;midi?.Dispose();web.Dispose();};
    }
    private async Task InitializeAsync()
    {
        try{
            Directory.CreateDirectory(dataDir);
            var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(dataDir,"WebView"));
            await web.EnsureCoreWebView2Async(environment);core=web.CoreWebView2;
            core.Settings.AreHostObjectsAllowed=false;
            core.Settings.AreDevToolsEnabled=false;
            core.SetVirtualHostNameToFolderMapping("midihud.local",assets,CoreWebView2HostResourceAccessKind.DenyCors);
            core.NavigationStarting+=(_,a)=>{
                if(!Local(a.Uri)){a.Cancel=true;return;}
                var uri=new Uri(a.Uri);
                if(uri.AbsolutePath.EndsWith('/')){
                    a.Cancel=true;var to=new UriBuilder(uri){Path=uri.AbsolutePath+"index.html"};
                    Dispatcher.BeginInvoke(new Action(()=>core.Navigate(to.Uri.AbsoluteUri)));return;
                }
                page++;
            };
            core.FrameNavigationStarting+=(_,a)=>a.Cancel=true;
            core.NewWindowRequested+=(_,a)=>a.Handled=true;
            core.PermissionRequested+=(_,a)=>a.State=CoreWebView2PermissionState.Deny;
            core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
            core.WebResourceRequested+=(_,a)=>{
                var uri=a.Request.Uri;
                if(Local(uri)){
                    var path=Uri.UnescapeDataString(new Uri(uri).AbsolutePath).TrimStart('/');
                    if(path.EndsWith(".mjs",StringComparison.OrdinalIgnoreCase)){
                        var file=Path.GetFullPath(Path.Combine(assets,path));
                        if(file.StartsWith(Path.GetFullPath(assets)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)&&File.Exists(file))
                            a.Response=core.Environment.CreateWebResourceResponse(new MemoryStream(File.ReadAllBytes(file)),200,"OK","Content-Type: application/javascript; charset=utf-8");
                    }
                    return;
                }
                if(uri.StartsWith("blob:"+Origin+"/",StringComparison.Ordinal)||uri.StartsWith("data:",StringComparison.Ordinal))return;
                a.Response=core.Environment.CreateWebResourceResponse(new MemoryStream(Encoding.UTF8.GetBytes("Blocked")),403,"Blocked","Content-Type: text/plain");
            };
            core.WebMessageReceived+=Received;
            var source=File.ReadAllText(Path.Combine(assets,"windows-qa","core","native-bridge.js"));
            await core.AddScriptToExecuteOnDocumentCreatedAsync("if(window===window.top && location.origin==='https://midihud.local' && location.pathname.startsWith('/windows-qa/')){\n"+source+"\n}");
            core.Navigate(Origin+Prefix+"index.html");
        }catch(Exception e){MessageBox.Show(this,"No se pudo iniciar MIDI HUD. Comprueba WebView2 Runtime.\n"+e.Message,"MIDI HUD");Close();}
    }
    private void OpenController()
    {
        if(monitor!=null){monitor.Activate();return;}
        monitor=new ControllerMonitor{Owner=this};
        monitor.Closed+=(_,_)=>monitor=null;
        monitor.Show();
    }
    private MidiInput Midi()=>midi??=new MidiInput(Dispatcher,ev=>Post(new{kind="event",@event=ev}),(source,data)=>monitor?.Observe(source,data));
    private void Post(object body)
    {
        if(!closed&&core!=null&&Local(core.Source))
            try{core.PostWebMessageAsString(JsonSerializer.Serialize(body));}catch(InvalidOperationException){}
    }
    private async void Received(object? sender,CoreWebView2WebMessageReceivedEventArgs args)
    {
        if(core==null||!Local(args.Source)||!Local(core.Source)||args.Source!=core.Source)return;
        string? id=null;var generation=page;
        try{
            var raw=args.TryGetWebMessageAsString();if(raw.Length>3_100_000)return;
            using var json=JsonDocument.Parse(raw);var root=json.RootElement;
            id=root.GetProperty("id").GetString();if(id==null||id.Length>32)return;
            var command=root.GetProperty("command").GetString();var payload=root.GetProperty("payload");
            object? result;
            switch(command){
                case "midi.open":case "midi.list": result=await Midi().RefreshAsync();break;
                case "midi.select": result=await Midi().SelectAsync(payload.GetProperty("id").GetString()??"");break;
                case "midi.bluetooth":
                    Process.Start(new ProcessStartInfo("ms-settings:bluetooth"){UseShellExecute=true});result=new{opened=true};break;
                case "controller.open": OpenController();result=true;break;
                case "cloud.config":result=new{configured=false};break;
                case "cloud.restore":case "cloud.disconnect":result=null;break;
                case "cloud.connect":case "cloud.request":throw new InvalidOperationException("Google Drive aún no está configurado para Windows.");
                case "share.text":
                    var text=payload.GetProperty("text").GetString()??"";if(text.Length>3_000_000)throw new InvalidOperationException("Archivo demasiado grande.");
                    var name=Regex.Replace(Path.GetFileName(payload.GetProperty("name").GetString()??"MIDI-HUD.json"),"[^a-zA-Z0-9._-]","_");
                    var dialog=new SaveFileDialog{FileName=string.IsNullOrEmpty(name)?"MIDI-HUD.json":name,Filter="JSON|*.json|Todos los archivos|*.*"};
                    if(dialog.ShowDialog(this)!=true)throw new InvalidOperationException("Exportación cancelada.");
                    File.WriteAllText(dialog.FileName,text,new UTF8Encoding(false));result=new{saved=true};break;
                default:throw new InvalidOperationException("Acción no disponible.");
            }
            if(generation==page)Post(new{kind="reply",id,result});
        }catch(Exception e){if(id!=null&&generation==page)Post(new{kind="reply",id,error=e.Message});}
    }
}
