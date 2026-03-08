import { connect } from 'tls';

export default {
  name: 'ssl-check',
  async run({ domain, port = 443 }) {
    if (!domain) return { ok: false, error: 'domain required' };

    return new Promise(resolve => {
      const socket = connect({ host: domain, port, servername: domain, timeout: 10000 }, () => {
        const cert = socket.getPeerCertificate(true);
        const cipher = socket.getCipher();
        const proto = socket.getProtocol();
        socket.destroy();

        if (!cert?.subject) {
          return resolve({ ok: false, error: 'No certificate received' });
        }

        const now = new Date();
        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const daysRemaining = Math.floor((validTo - now) / 86400000);
        const isExpired = validTo < now;
        const isNotYetValid = validFrom > now;

        // Parse SANs
        const san = cert.subjectaltname?.split(', ').map(s => s.replace(/^DNS:/, '')) || [];

        // Grading heuristic
        let grade = 'A';
        if (isExpired) grade = 'F';
        else if (daysRemaining < 14) grade = 'B';
        else if (proto === 'TLSv1' || proto === 'TLSv1.1') grade = 'C';

        resolve({
          ok: true,
          domain,
          port,
          valid: !isExpired && !isNotYetValid,
          grade,
          subject: cert.subject?.CN,
          issuer: cert.issuer?.O || cert.issuer?.CN,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining,
          isExpired,
          fingerprint: cert.fingerprint256,
          sans: san,
          protocol: proto,
          cipher: cipher?.name,
        });
      });

      socket.on('error', err => {
        resolve({ ok: false, domain, port, error: err.message });
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ ok: false, domain, port, error: 'Connection timed out' });
      });
    });
  },
};
