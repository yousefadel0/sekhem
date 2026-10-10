using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

// Windows Common Item Dialog. No shell invocation, path enumeration, or file access grant.
internal static class NativeFolderPicker {
    [STAThread] public static int Main(string[] args) {
        if (args.Length != 1 || args[0] != "--choose-folder") return 2;
        try { Console.OutputEncoding = new UTF8Encoding(false); Console.Write(new JavaScriptSerializer().Serialize(Choose())); return 0; }
        catch { Console.Write("null"); return 1; }
    }
    private static string Choose() {
        var dialog = (IFileDialog)new FileOpenDialog();
        try {
            uint options; dialog.GetOptions(out options);
            dialog.SetOptions(options | 0x20u | 0x40u | 0x800u | 0x8u); // PICKFOLDERS, FORCEFILESYSTEM, PATHMUSTEXIST, NOCHANGEDIR
            dialog.SetTitle("SEKHEM — Choose workspace folder"); dialog.SetOkButtonLabel("Open");
            int result = dialog.Show(IntPtr.Zero);
            if (result == unchecked((int)0x800704C7)) return null;
            Marshal.ThrowExceptionForHR(result);
            IShellItem item; dialog.GetResult(out item);
            try { IntPtr path; item.GetDisplayName(0x80058000, out path); try { return Marshal.PtrToStringUni(path); } finally { Marshal.FreeCoTaskMem(path); } }
            finally { Marshal.ReleaseComObject(item); }
        } finally { Marshal.ReleaseComObject(dialog); }
    }
    [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")] private class FileOpenDialog { }
    [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileDialog {
        [PreserveSig] int Show(IntPtr owner);
        void SetFileTypes(uint count, IntPtr filters); void SetFileTypeIndex(uint index); void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie); void Unadvise(uint cookie);
        void SetOptions(uint options); void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem item); void SetFolder(IShellItem item); void GetFolder(out IShellItem item); void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name); void GetFileName(out IntPtr name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title); void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label); void GetResult(out IShellItem item);
        void AddPlace(IShellItem item, uint alignment); void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
        void Close(int result); void SetClientGuid(ref Guid guid); void ClearClientData(); void SetFilter(IntPtr filter);
    }
    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem {
        void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr value);
        void GetParent(out IShellItem parent); void GetDisplayName(uint name, out IntPtr value);
        void GetAttributes(uint mask, out uint attributes); void Compare(IShellItem item, uint hint, out int order);
    }
}
