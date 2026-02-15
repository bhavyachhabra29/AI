# Microsoft Graph Setup Instructions

Since SMTP authentication is disabled for your tenant, you need to set up Microsoft Graph API for sending emails.

## Azure App Registration Setup

1. **Go to Azure Portal** (https://portal.azure.com)
2. **Navigate to Azure Active Directory > App registrations**
3. **Click "New registration"**
   - Name: `TechDocs Generator`
   - Supported account types: `Accounts in this organizational directory only`
   - Redirect URI: Leave blank
   - Click **Register**

4. **Note down the values** from the Overview page:
   - Application (client) ID
   - Directory (tenant) ID

5. **Create Client Secret**:
   - Go to **Certificates & secrets**
   - Click **New client secret**
   - Description: `TechDocs Secret`
   - Expires: Choose appropriate duration
   - Click **Add** and copy the **Value** (not the ID)

6. **Configure API Permissions**:
   - Go to **API permissions**
   - Click **Add a permission**
   - Choose **Microsoft Graph**
   - Choose **Application permissions**
   - Search and add these permissions:
     - `Mail.Send` - Send mail as any user
     - `User.Read.All` - Read all users' basic profiles
   - Click **Grant admin consent** for your organization

## Update Environment Variables

Update your `.env` file with the following values:

```env
# Microsoft Graph Configuration
MICROSOFT_CLIENT_ID=your_application_client_id_here
MICROSOFT_CLIENT_SECRET=your_client_secret_value_here
MICROSOFT_TENANT_ID=your_directory_tenant_id_here
EMAIL_FROM=your-valid-email-address
```

