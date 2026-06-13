'use client';

import Link from 'next/link';
import { AuthPage } from 'supertokens-auth-react/ui';
import { EmailPasswordPreBuiltUI } from 'supertokens-auth-react/recipe/emailpassword/prebuiltui';

export default function AuthPageWrapper() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center">
        <AuthPage preBuiltUIList={[EmailPasswordPreBuiltUI]} />
      </div>
      <footer className="py-4 px-6 text-center text-xs text-muted-foreground border-t border-border">
        <Link
          href="/landing.html"
          className="hover:text-foreground transition-colors"
          target="_blank"
          rel="noopener"
        >
          ← Back to Audit Intellect home
        </Link>
      </footer>
    </div>
  );
}
