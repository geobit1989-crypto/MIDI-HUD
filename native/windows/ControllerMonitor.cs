using System.Windows;
using System.Windows.Controls;
using System.IO;
using Microsoft.Win32;
namespace MidiHud.Windows;
internal sealed class ControllerMonitor : Window
{
    private readonly TextBox log=new(){IsReadOnly=true,AcceptsReturn=true,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
    private readonly TextBox expected=new(){Text="CC 2 80 127",MinWidth=140};
    private readonly TextBlock result=new(){Text="Sin prueba activa",Margin=new Thickness(8)};
    private readonly CheckBox clock=new(){Content="Mostrar Clock",IsChecked=false,Margin=new Thickness(8)};
    private string? target;
    private readonly Queue<string> lines=new();
    public ControllerMonitor()
    {
        Title="MIDI HUD — Controller Manager";Width=700;Height=480;
        var p=new DockPanel();var top=new StackPanel();DockPanel.SetDock(top,Dock.Top);
        top.Children.Add(new TextBlock{Text="Monitor de recepción. Selecciona la entrada en LIVE. Formato: CC canal número valor / PC canal programa (0–127).",TextWrapping=TextWrapping.Wrap,Margin=new Thickness(8)});
        var row=new StackPanel{Orientation=Orientation.Horizontal};
        row.Children.Add(expected);
        var arm=new Button{Content="Verificar siguiente CC/PC",Margin=new Thickness(6)};
        arm.Click+=(_,_)=>{target=string.Join(" ",expected.Text.Trim().ToUpperInvariant().Split(' ',StringSplitOptions.RemoveEmptyEntries));result.Text="Esperando mensaje…";};
        row.Children.Add(arm);row.Children.Add(clock);
        var clear=new Button{Content="Limpiar",Margin=new Thickness(6)};clear.Click+=(_,_)=>{lines.Clear();log.Clear();target=null;result.Text="Sin prueba activa";};
        var save=new Button{Content="Exportar",Margin=new Thickness(6)};save.Click+=(_,_)=>{var d=new SaveFileDialog{FileName="midi-monitor.txt",Filter="Texto|*.txt"};if(d.ShowDialog(this)==true)File.WriteAllLines(d.FileName,lines);};
        row.Children.Add(clear);row.Children.Add(save);top.Children.Add(row);top.Children.Add(result);p.Children.Add(top);p.Children.Add(log);Content=p;
    }
    public void Observe(string source,int[] b)
    {
        if(b.Length==0)return;
        var status=b[0];if(status==248&&clock.IsChecked!=true)return;
        var kind=status&240;var channel=(status&15)+1;
        var decoded=kind==176&&b.Length>=3?$"CC {channel} {b[1]} {b[2]}":kind==192&&b.Length>=2?$"PC {channel} {b[1]}":status==248?"Clock":string.Join(" ",b.Select(x=>x.ToString("X2")));
        if(target!=null&&(kind==176||kind==192)){result.Text=decoded==target?"Correcto: "+decoded:"No coincide: esperado "+target+"; recibido "+decoded;target=null;}
        lines.Enqueue(DateTime.Now.ToString("HH:mm:ss.fff")+" | "+source+" | "+decoded);
        while(lines.Count>300)lines.Dequeue();
        log.Text=string.Join(Environment.NewLine,lines);log.ScrollToEnd();
    }
}
