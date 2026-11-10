import { NextResponse } from 'next/server';
import os from 'os';

export async function GET() {
  try {
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];

    for (const name of Object.keys(interfaces)) {
      const netList = interfaces[name];
      if (!netList) continue;
      for (const net of netList) {
        if (net.family === 'IPv4' && !net.internal) {
          addresses.push(net.address);
        }
      }
    }

    // Prefer 192.168.x.x or 10.x.x.x
    const preferred =
      addresses.find((ip) => ip.startsWith('192.168.')) ||
      addresses.find((ip) => ip.startsWith('10.')) ||
      addresses[0] ||
      'localhost';

    const port = process.env.PORT || '3000';
    return NextResponse.json({
      ip: preferred,
      allIps: addresses,
      port,
      lanUrl: `http://${preferred}:${port}`,
    });
  } catch (err: any) {
    return NextResponse.json({
      ip: 'localhost',
      allIps: [],
      port: '3000',
      lanUrl: 'http://localhost:3000',
      error: err.message,
    });
  }
}

