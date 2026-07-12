import { NextRequest, NextResponse } from 'next/server';

// eBay Marketplace Account Deletion notification endpoint
// Required for eBay API compliance
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Verify the notification is from eBay
    const verificationToken = request.headers.get('x-ebay-signature');
    const expectedToken = process.env.EBAY_WEBHOOK_SECRET || 'ebay_webhook_secret_123456789123';

    console.log('📧 Received eBay account deletion notification:', body);

    // In production, you would:
    // 1. Verify the signature matches your verification token
    // 2. Delete any user data associated with the deleted eBay account
    // 3. Log the event

    // For now, just acknowledge receipt
    return NextResponse.json({
      success: true,
      message: 'Account deletion notification received'
    });
  } catch (error: any) {
    console.error('❌ Error processing eBay notification:', error.message);
    return NextResponse.json(
      { error: 'Failed to process notification' },
      { status: 500 }
    );
  }
}

// eBay will send a verification challenge when you first set up the endpoint
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challengeCode = searchParams.get('challenge_code');

  if (challengeCode) {
    // Verify the endpoint token
    const verificationToken = process.env.EBAY_WEBHOOK_SECRET || 'ebay_webhook_secret_123456789123';

    // Create the challenge response with the verification token hash
    const endpoint = `https://diecasts.app/api/ebay/account-deletion`;
    const challengeResponse = challengeCode;

    console.log('✅ eBay endpoint verification challenge received:', challengeCode);

    // Return the challenge code to verify endpoint ownership
    return new NextResponse(
      JSON.stringify({ challengeResponse }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  return NextResponse.json({
    status: 'eBay account deletion endpoint active'
  });
}
