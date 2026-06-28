namespace TripConcierge.Shared.Configuration;

/// <summary>
/// Loads the repo-root .env file for local development. In hosted/CI environments where no
/// .env file exists, this is a no-op and real process environment variables are used as-is.
/// </summary>
public static class EnvironmentLoader
{
    private static bool _loaded;

    public static void Load()
    {
        if (_loaded)
        {
            return;
        }

        _loaded = true;

        var envFile = FindEnvFile(AppContext.BaseDirectory);
        if (envFile is not null)
        {
            DotNetEnv.Env.Load(envFile);
        }
    }

    private static string? FindEnvFile(string startDirectory)
    {
        var dir = new DirectoryInfo(startDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, ".env");
            if (File.Exists(candidate))
            {
                return candidate;
            }

            dir = dir.Parent;
        }

        return null;
    }
}
