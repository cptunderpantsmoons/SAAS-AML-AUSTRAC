'use client';

import { AuthPage } from "supertokens-auth-react/ui";
import { EmailPasswordPreBuiltUI } from "supertokens-auth-react/recipe/emailpassword/prebuiltui";

export default function AuthPageWrapper() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <AuthPage preBuiltUIList={[EmailPasswordPreBuiltUI]} />
    </div>
  );
}
