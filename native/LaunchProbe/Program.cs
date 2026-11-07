// Test-only executable: no UI, network or audio. Writes only beside its own build output.
File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "started.txt"), Environment.ProcessId.ToString());
