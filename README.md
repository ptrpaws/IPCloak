# ipcloak

an ipflood/ipfuck inspired chromium extension for spoofing your ip in http headers

## how it works
ipcloak uses chromium's `declarativeNetRequest` api to set rules that modify request headers (like `X-Forwarded-For`, `X-Real-IP`, `Via` etc.) on the fly to confuse *some* websites into thinking you have a different ip than you actually have

> [!NOTE]  
> this only changes the ip address in the browser's http headers and it doesn't change your actual ip address or make you anonymous. sites can still use other methods to identify you, and your real traffic is still visible to your network/isp

## installation
1. clone or download this repository
2. open your browser and go to `chrome://extensions`
3. enable "developer mode"
4. click "load unpacked" and select this project's folder
5. click the new icon in your toolbar to open the popup and configure your settings :3
