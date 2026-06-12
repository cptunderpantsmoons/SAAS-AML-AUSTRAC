import SuperTokens, { SuperTokensWrapper } from "supertokens-auth-react";
import Session from "supertokens-auth-react/recipe/session";
import EmailPassword from "supertokens-auth-react/recipe/emailpassword";

export const frontendConfig = () => {
  return {
    appInfo: {
      appName: process.env.NEXT_PUBLIC_APP_NAME || "AML AUSTRAC",
      apiDomain: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
      websiteDomain: process.env.NEXT_PUBLIC_WEBSITE_DOMAIN || "http://localhost:3000",
    },
    usesDynamicLoginMethods: false,
    recipeList: [
      EmailPassword.init({
        signInAndUpFeature: {
          disableDefaultImplementation: false,
        },
      }),
      Session.init({
        tokenTransferMethod: "header",
      }),
    ],
  };
};

if (typeof window !== "undefined") {
  SuperTokens.init(frontendConfig());
}

export { SuperTokens, Session, SuperTokensWrapper };
