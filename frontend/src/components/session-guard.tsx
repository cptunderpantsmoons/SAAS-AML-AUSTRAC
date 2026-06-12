'use client';

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Session from "supertokens-auth-react/recipe/session";

export default function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkSession = async () => {
      const doesSessionExist = await Session.doesSessionExist();
      if (!doesSessionExist && pathname !== "/auth") {
        router.push("/auth");
      }
    };
    checkSession();
  }, [pathname, router]);

  return <>{children}</>;
}
