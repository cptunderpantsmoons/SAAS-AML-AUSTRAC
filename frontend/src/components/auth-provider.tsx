'use client';

import { SuperTokensWrapper } from "@/lib/supertokens";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SuperTokensWrapper>{children}</SuperTokensWrapper>;
}
