# ANAF API Registration Documentation

## Overview
To develop applications (mobile/web/desktop) that interact with the RO e-Factura and RO e-Transport systems using OAuth2, you must register your application and acquire a `client_id`.

## Registration URL
- [ANAF API Registration Portal](https://www.anaf.ro/anaf/internet/ANAF/servicii_online/inreg_api)
  (Also known as www.anaf.ro/InregOauth)

## How It Works (Security Matrix)
The ANAF system relies heavily on OAuth2 access tokens wrapped around Digital Certificates:

1. **Client App ID:** Developers acquire a `client_id` representing their specific application.
2. **User Identification:** End-users are identified *not* by your application, but by the serial number of their valid **qualified digital certificate** used during the OAuth token request.
3. **Token Authorization:** Both access tokens and refresh tokens are tied directly to the associated certificate. Thus, every API request made via `api.anaf.ro` checks:
   - Your App (`client_id`) is valid.
   - The user's specific digital certificate authorizes this application to handle their data.

## Registration Process for App Developers
- Non-developers (end-users) registered in SPV do NOT need to create an account here. 
- You MUST create an account here specifically to obtain API keys and manage your server/web applications with ANAF.

### Form Fields Required:
To register as an API developer, the following information is required on the ANAF portal:
1. First and Last Name
2. Email Address
3. CNP (Personal Numeric Code)
4. ID Document Type (e.g. CI/BI)
5. ID Series and Number
6. Phone Number
7. Desired Username and Password

Once authenticated and registered, you will navigate to an interface specifically meant for declaring your software application boundaries to ANAF. This setup grants you a unique set of credentials per application developed.
