import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';

import { db } from '@/server/db';
import { accounts, sessions, users, verificationTokens } from '@/server/db/schema';

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Magic-link sign-in only (passwordless email). To add OAuth later, push
 * additional providers into the `providers` array.
 *
 * Email delivery:
 * - If AUTH_RESEND_KEY is set, the magic link is sent via the Resend HTTP API.
 * - Otherwise (dev / first-time contributors), the link is printed to the
 *   server console so you can sign in without configuring email.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),

  session: { strategy: 'jwt' },

  pages: {
    signIn: '/signin',
    verifyRequest: '/signin/verify',
  },

  providers: [
    {
      id: 'email',
      type: 'email',
      name: 'Email',
      from: process.env.AUTH_EMAIL_FROM ?? 'noreply@video-wizard.local',
      maxAge: 24 * 60 * 60,
      options: {},
      async sendVerificationRequest({ identifier, url, provider }) {
        const resendKey = process.env.AUTH_RESEND_KEY;

        if (!resendKey) {
          // Dev fallback: print the magic link to stdout. This lets new
          // contributors test sign-in immediately without setting up email.
          console.log(
            [
              '',
              'Magic sign-in link (dev mode — AUTH_RESEND_KEY not set)',
              `  to:  ${identifier}`,
              `  url: ${url}`,
              '',
            ].join('\n')
          );
          return;
        }

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: 'Sign in to Video Wizard',
            html: `
              <p>Click the link below to sign in to Video Wizard:</p>
              <p><a href="${url}">${url}</a></p>
              <p>If you didn't request this, you can safely ignore this email.</p>
            `,
          }),
        });

        if (!res.ok) {
          const errorBody = await res.text();
          throw new Error(`Resend send failed (${res.status}): ${errorBody}`);
        }
      },
    },
  ],

  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
