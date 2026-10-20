import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";

// Local development works without a browser auth system. Production access
// requires verified deployment credentials or your application's auth policy.
export default eveChannel({ auth: [vercelOidc(), localDev()] });
