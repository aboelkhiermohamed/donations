import { NextResponse } from 'next/server';
import os from 'os';

export async function GET() {
  try {
    const interfaces = os.networkInterfaces();
    const candidateIps: { ip: string; name: string; isVirtual: boolean }[] = [];

    for (const name of Object.keys(interfaces)) {
      const netInterface = interfaces[name];
      if (!netInterface) continue;
      
      const nameLower = name.toLowerCase();
      const isVirtual = nameLower.includes('virtual') || 
                        nameLower.includes('vbox') || 
                        nameLower.includes('vmware') || 
                        nameLower.includes('wsl') || 
                        nameLower.includes('host-only') ||
                        nameLower.includes('vethernet') ||
                        nameLower.includes('pseudo');

      for (const net of netInterface) {
        if (net.family === 'IPv4' && !net.internal) {
          if (net.address.startsWith('192.168.') || 
              net.address.startsWith('10.') || 
              net.address.startsWith('172.')) {
            candidateIps.push({
              ip: net.address,
              name: name,
              isVirtual
            });
          }
        }
      }
    }

    // Sort: physical interfaces first, then common home subnets, then virtual subnets
    candidateIps.sort((a, b) => {
      // 1. Prioritize non-virtual over virtual
      if (a.isVirtual && !b.isVirtual) return 1;
      if (!a.isVirtual && b.isVirtual) return -1;

      // 2. Prioritize common home WiFi subnets (192.168.1.x, 192.168.0.x, 10.0.0.x)
      const aIsCommon = a.ip.startsWith('192.168.1.') || a.ip.startsWith('192.168.0.') || a.ip.startsWith('10.0.');
      const bIsCommon = b.ip.startsWith('192.168.1.') || b.ip.startsWith('192.168.0.') || b.ip.startsWith('10.0.');
      if (aIsCommon && !bIsCommon) return -1;
      if (!aIsCommon && bIsCommon) return 1;

      // 3. Deprioritize VirtualBox Host-Only adapter default subnet (192.168.56.x)
      const aIsVbox = a.ip.startsWith('192.168.56.');
      const bIsVbox = b.ip.startsWith('192.168.56.');
      if (aIsVbox && !bIsVbox) return 1;
      if (!aIsVbox && bIsVbox) return -1;

      return 0;
    });

    return NextResponse.json({ 
      localIps: candidateIps.map(c => c.ip),
      interfaces: candidateIps 
    });
  } catch (error) {
    console.error('Failed to get local IPs:', error);
    return NextResponse.json({ localIps: [], interfaces: [] });
  }
}
