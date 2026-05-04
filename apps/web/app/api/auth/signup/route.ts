import { NextRequest, NextResponse } from 'next/server';

import { authService } from '@/server/services/auth-service';
import { ValidationError } from '@/server/lib/utils';

/**
 * POST /api/auth/signup
 * Creates a new user account with email + password.
 * Sign-in is then performed via the Credentials provider at /api/auth/[...nextauth].
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await authService.signup(body);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    console.error('Signup error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create account',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
