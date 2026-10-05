import type { Question } from '../core/types';

type Opt = [text: string, explanation: string];

/** Compact builder: `correct` is the 0-based index of the right option. */
function q(id: string, objectives: string[], prompt: string, correct: number, opts: Opt[]): Question {
  return {
    id,
    prompt,
    objectives,
    options: opts.map(([text, explanation], i) => ({
      id: String.fromCharCode(97 + i),
      text,
      correct: i === correct,
      explanation,
    })),
  };
}

/**
 * CURRICULUM: knowledge-check questions for arc missions not yet built as
 * levels (m04-m12). When LEVELS builds a mission, move its set into the
 * mission file's `debriefQuestions`. Until then these also feed spaced review.
 */
export const ARC_QUESTIONS: Record<string, Question[]> = {
  m04: [
    q('q1', ['5.6'], 'A user receives an email "from IT": their mailbox is full and they must sign in at micros0ft-support.com within one hour or lose their mail. What should the user do?', 2, [
      ['Click the link to check whether the page looks genuine', 'Simply visiting can deliver a drive-by download, and a convincing clone page is how credentials get harvested.'],
      ['Reply to the sender and ask whether it is legitimate', 'The reply goes to the attacker. It confirms the address is live, and the attacker will just say yes.'],
      ['Report it with the phishing-report button without clicking anything', 'Reporting lets the SOC pull the same message from every inbox and block the domain. That is the trained response to a suspicious message.'],
      ['Delete it and move on', 'You are safe, but colleagues who got the same message are not. Without a report the SOC never learns of the campaign.'],
    ]),
    q('q2', ['2.2'], 'The CFO gets an email from what looks like the CEO\u2019s own account: "Wire $48,000 to our new supplier today. I\u2019m in meetings, don\u2019t call." Which attack is this?', 0, [
      ['Business email compromise (BEC)', 'Impersonating (or taking over) an executive\u2019s email to authorize a payment is the definition of BEC. The "don\u2019t call" line exists to block out-of-band verification.'],
      ['Vishing', 'Vishing is voice phishing over a phone call. This arrived by email.'],
      ['Watering hole', 'A watering-hole attack compromises a website the targets visit. Nothing here involves a website.'],
      ['Typosquatting', 'A look-alike domain might be used, but the defining feature here is executive impersonation to authorize a payment, which is BEC.'],
    ]),
    q('q3', ['4.5'], 'Attackers are sending mail that spoofs your exact domain in the From header. Which control lets receiving servers authenticate your mail AND tells them to reject what fails?', 3, [
      ['SPF', 'SPF lists the IPs allowed to send for the domain, but it checks the envelope sender, not the visible From, and has no policy telling receivers to reject.'],
      ['DKIM', 'DKIM signs messages so tampering can be detected, but on its own it gives receivers no instruction on what to do with failures.'],
      ['A web filter with URL reputation', 'Web filtering blocks malicious sites. It does nothing to authenticate who sent an email.'],
      ['DMARC with a p=reject policy', 'DMARC requires SPF/DKIM results to align with the From domain and publishes a policy (reject) for receivers to apply to failures.'],
    ]),
    q('q4', ['2.4'], 'Sign-in logs show j.ortiz authenticating from Chicago at 09:00 and from Singapore at 09:20, and both sessions are still active. Which indicators are present?', 1, [
      ['Account lockout and blocked content', 'Lockout follows repeated failed logins, and blocked content is a filter firing. Both of these sign-ins succeeded.'],
      ['Impossible travel and concurrent session usage', 'No one travels 15,000 km in 20 minutes, and two simultaneous sessions from different continents point to stolen credentials.'],
      ['Out-of-cycle logging', 'Out-of-cycle logging is activity logged at times there should be none. These are business-hours sign-ins; the anomaly is location and concurrency.'],
      ['Resource inaccessibility', 'That would be users unable to reach their data. Here the attacker has too much access, not too little.'],
    ]),
  ],
  m05: [
    q('q1', ['1.3'], 'An emergency patch goes on the payroll server tonight. Which change-management item lets you restore service if the patch breaks payroll?', 2, [
      ['Impact analysis', 'Impact analysis predicts what the change will affect before you make it. It does not undo anything.'],
      ['Maintenance window', 'The window sets WHEN the change happens to limit disruption, not how to reverse it.'],
      ['Backout plan', 'A backout plan is the documented, tested way to roll back to the last good state if the change fails.'],
      ['Stakeholder approval', 'Approval authorizes the change. It gives you nothing to restore from.'],
    ]),
    q('q2', ['1.1'], 'Policy requires EDR on every server, but a legacy server cannot run the agent. It is moved to an isolated VLAN with extra network monitoring. What type of control is the isolation?', 0, [
      ['Compensating', 'A compensating control is an alternative that meets the intent of a required control that cannot be implemented. Here, isolation stands in for EDR.'],
      ['Corrective', 'Corrective controls fix or restore after an incident, like restoring from backup. Nothing has happened yet.'],
      ['Deterrent', 'Deterrents discourage attempts, like warning signs. Isolation actually limits what an attacker can reach.'],
      ['Directive', 'Directive controls tell people what to do, like a policy. This is a technical substitute for a missing control.'],
    ]),
    q('q3', ['1.1'], 'A sign at the data-center fence reads "Area under 24/7 video surveillance." What is the sign\u2019s PRIMARY control type?', 3, [
      ['Detective', 'The cameras record and so detect. The sign itself records nothing.'],
      ['Preventive', 'A preventive control physically or technically stops the act, like a locked door. A sign stops no one.'],
      ['Compensating', 'Nothing is being substituted for an unavailable control.'],
      ['Deterrent', 'The sign works by discouraging intruders with the threat of being seen. That is deterrence.'],
    ]),
    q('q4', ['4.3'], 'A scan flags a critical CVE on 40 servers. You confirm that 12 of them do not run the vulnerable service at all. What are those 12, and what is next?', 1, [
      ['False negatives; rescan with stronger settings', 'A false negative is a real vulnerability the scanner MISSED. These are the opposite.'],
      ['False positives; document them, remediate the other 28 by CVSS and exposure, then rescan to validate', 'Reported but not real = false positive. Confirmed findings get prioritized and fixed, and a rescan validates the remediation.'],
      ['True positives; patch all 40 tonight', 'Patching hosts that are not affected wastes the change window and adds risk for no benefit.'],
      ['Accept the risk on all 40 until the next quarter', 'The 28 confirmed hosts carry a critical vulnerability. Accepting that needs a formal risk decision, not a default.'],
    ]),
    q('q5', ['5.1'], '"All user passwords must be at least 14 characters." In the governance hierarchy, this statement is a:', 0, [
      ['Standard', 'Standards are mandatory, specific, measurable requirements that support a policy. SY0-701 lists password standards explicitly.'],
      ['Policy', 'A policy states high-level intent ("we protect accounts with strong authentication"), not exact numbers.'],
      ['Procedure', 'A procedure is step-by-step instructions, such as how to reset a password.'],
      ['Guideline', 'Guidelines are recommendations, and "must" makes this mandatory.'],
    ]),
  ],
  m06: [
    q('q1', ['1.4'], 'You must store user passwords so that a thief who dumps the database cannot reverse them or look them up in precomputed tables. What is BEST?', 2, [
      ['Encrypt them with AES, with the key on the same server', 'Encryption is reversible. Whoever steals the database and the key gets every password.'],
      ['Hash them with unsalted SHA-256', 'Unsalted fast hashes fall to rainbow tables and GPU brute force, and identical passwords produce identical hashes.'],
      ['Salt each password and hash it with a key-stretching algorithm (bcrypt, PBKDF2)', 'Salting defeats precomputed tables, and key stretching makes every guess expensive. Hashing is one-way, so nothing can be decrypted.'],
      ['Base64-encode them', 'Base64 is encoding, not cryptography. Anyone can decode it instantly.'],
    ]),
    q('q2', ['1.4'], 'The private key for www.example.com has leaked. What must happen to the certificate?', 3, [
      ['Nothing until it expires next year', 'Until then, anyone holding the key can impersonate the site with a certificate browsers still trust.'],
      ['Renew it with the same key pair', 'The leaked key would still be valid, so the compromise carries over to the new certificate.'],
      ['Replace it with a self-signed certificate', 'Browsers do not trust self-signed certificates, and the leaked certificate would still be valid.'],
      ['Revoke it so it appears on the CRL / OCSP, then reissue it with a new key pair', 'Revocation tells clients to stop trusting the compromised certificate. A new key pair ends the attacker\u2019s ability to impersonate the site.'],
    ]),
    q('q3', ['1.4'], 'A browser and a server that have never communicated must agree on a fast bulk-encryption key over the open internet. How does TLS do it?', 0, [
      ['Asymmetric key exchange (e.g. Diffie-Hellman) to agree a symmetric session key', 'Asymmetric crypto solves secure key exchange between strangers, and the symmetric session key then encrypts the bulk data quickly.'],
      ['The server emails the symmetric key in advance', 'That moves the key-distribution problem to email, which is not secure.'],
      ['Both sides hash the data instead of encrypting it', 'Hashing is one-way and provides integrity, not confidentiality. The other side could not read the data.'],
      ['Steganography hides the key inside an image', 'Steganography is obscurity, not encryption. Anyone who finds the hidden key can use it.'],
    ]),
    q('q4', ['3.3'], 'A payment app must keep issuing refunds against stored cards, but the systems that hold those records must not contain real card numbers. What is BEST?', 1, [
      ['Masking the numbers on screen', 'Masking hides digits when displayed, but the full number is still stored underneath.'],
      ['Tokenization', 'A random token replaces the card number, and only the secure token vault can map it back. Downstream systems hold nothing of value.'],
      ['Hashing the numbers', 'Hashing is one-way, so the original number could never be recovered to process a refund.'],
      ['Moving the database to another country', 'That changes data sovereignty, not exposure. The real numbers would still be stored.'],
    ]),
    q('q5', ['4.6'], 'Admin sign-in currently requires a password plus a security question. Which change adds a genuinely different authentication factor?', 2, [
      ['Require a longer password', 'A stronger password is still the same single factor: something you know.'],
      ['Add a second security question', 'Security questions are also something you know, so this is still one factor type.'],
      ['Add a FIDO2 hardware security key', 'A security key is something you have. Combined with the password, that is true MFA, and FIDO2 also resists phishing.'],
      ['Add a 6-digit PIN', 'A PIN is also something you know.'],
    ]),
    q('q6', ['3.3'], 'A stolen laptop had full-disk encryption, and the thief never got the pre-boot password. Which data state did that encryption protect?', 2, [
      ['Data in transit', 'In transit is data moving across a network, which TLS or a VPN protects.'],
      ['Data in use', 'In use is data being processed in memory by a running system. A powered-off stolen laptop is not processing anything.'],
      ['Data at rest', 'Data stored on the drive is at rest. Full-disk encryption keeps it unreadable without the key.'],
      ['Data sovereignty', 'Sovereignty is about which jurisdiction\u2019s laws apply to data. It is not a data state.'],
    ]),
  ],
  m07: [
    q('q1', ['3.2'], 'Admins must manage servers in a high-security zone from the user network. Which design MOST reduces the attack surface?', 3, [
      ['Allow RDP into the zone from every workstation', 'Every workstation becomes a path into the zone, so one phished PC reaches the servers.'],
      ['Port-forward each server\u2019s management port through the firewall', 'This exposes many management interfaces instead of one controlled path.'],
      ['Put admin workstations on the same subnet as the servers', 'That removes the zone boundary entirely.'],
      ['Allow access only through a hardened jump server with MFA and session logging', 'A jump server is the single, monitored entry point into the zone, so there is only one door to harden and watch.'],
    ]),
    q('q2', ['3.2'], 'An IPS must block attacks in real time in front of the database. How must it be deployed?', 0, [
      ['Inline (active), choosing whether a failure should fail-open or fail-closed', 'Only an inline device sits in the traffic path and can drop packets. Its failure mode is a trade-off between availability and security.'],
      ['On a network tap', 'A tap gives the device a copy of the traffic. It can detect and alert, but it cannot block.'],
      ['On a SPAN/mirror port', 'Mirroring is also passive monitoring, so the original packets still reach the database.'],
      ['On the admin\u2019s workstation', 'A host there protects only that workstation, not the database\u2019s network path.'],
    ]),
    q('q3', ['3.1'], 'A plant\u2019s SCADA controller runs an OS the vendor no longer patches, and it cannot be replaced for three years. What is BEST?', 1, [
      ['Connect it to the internet so the vendor can support it remotely', 'This exposes an unpatchable system to the whole internet, the worst possible move.'],
      ['Isolate it (air gap or a strictly segmented zone), allow only required flows, and monitor it', 'When you cannot patch, you reduce reachability. Segmentation plus monitoring compensates for the inability to patch.'],
      ['Force-install the newest desktop OS updates on it', 'Updates for a different OS can break an industrial controller, and none exist for its own OS.'],
      ['Accept the risk with no additional controls', 'Acceptance should be a documented decision after reasonable controls, not a substitute for them.'],
    ]),
    q('q4', ['4.5'], 'Firewall rules are evaluated top-down, first match wins. Where does an explicit "deny any any" rule belong?', 2, [
      ['First, so nothing slips through', 'As the first rule it matches everything, and no traffic ever reaches the allow rules below.'],
      ['In the middle, between inbound and outbound rules', 'Every allow rule below it would become unreachable.'],
      ['Last, after the specific allow rules', 'Specific allows match first, and everything else falls through to the final deny (implicit deny made explicit and logged).'],
      ['Nowhere; firewalls allow by default', 'A secure firewall denies by default. Allow-by-default is the misconfiguration.'],
    ]),
    q('q5', ['2.3'], 'A core switch still uses its factory admin/admin login, and the vendor stopped releasing firmware for it last year. Which vulnerability types apply?', 1, [
      ['Zero-day and race condition', 'Both problems are well known, so neither is a zero-day, and nothing here involves timing.'],
      ['Misconfiguration and end-of-life hardware', 'Unchanged defaults are a misconfiguration. A device with no more firmware updates is end-of-life, so future flaws will never be fixed.'],
      ['VM escape and resource reuse', 'Those are virtualization vulnerabilities, and the switch is physical hardware.'],
      ['Cross-site scripting', 'XSS is a web-application flaw. This is a network device problem.'],
    ]),
  ],
  m08: [
    q('q1', ['2.3'], 'Entering  \' OR \'1\'=\'1  in a login form returns every user record. What is the vulnerability, and what fixes it?', 0, [
      ['SQL injection; use parameterized queries and input validation', 'The input became part of the SQL statement. Parameterization keeps user data separate from query code.'],
      ['Cross-site scripting; encode output', 'XSS runs script in a victim\u2019s browser. Here the database query itself was altered.'],
      ['Buffer overflow; enable memory protections', 'Nothing overran a memory buffer. The query logic was rewritten.'],
      ['Directory traversal; restrict file paths', 'Traversal uses ../ to reach files outside the web root, but this attack changed a database query.'],
    ]),
    q('q2', ['2.3'], 'A setuid program checks that the user may write /tmp/report, then opens it. Between the check and the open, the attacker swaps the file for a link to /etc/passwd. What is this?', 3, [
      ['Memory injection', 'Memory injection puts code into a running process\u2019s memory. Here a file was swapped.'],
      ['Malicious update', 'No update channel is involved.'],
      ['Buffer overflow', 'No data overran a buffer. The flaw is the gap between check and use.'],
      ['Race condition (time-of-check / time-of-use)', 'The resource changed between the check (TOC) and the use (TOU), which is the textbook race condition.'],
    ]),
    q('q3', ['4.3'], 'Two findings: CVSS 9.8 on an isolated lab server with no sensitive data, and CVSS 7.5 on the internet-facing payment portal. What do you remediate FIRST?', 1, [
      ['The 9.8, because the highest base score always goes first', 'The CVSS base score ignores your environment. Exposure and impact can outweigh a higher base score.'],
      ['The 7.5 payment portal, because exposure and impact make its real risk higher', 'Prioritization adds environmental factors to the base score: who can reach it and what is at stake.'],
      ['Neither until both can be patched in one window', 'Delaying an exposed payment system to batch changes increases risk.'],
      ['Whichever is cheaper to fix', 'Cost matters in planning, but risk drives priority.'],
    ]),
    q('q4', ['4.1'], 'Twenty new web servers must start from a known-good, hardened configuration that is checked for drift over time. What should you implement?', 2, [
      ['Let each admin harden servers to personal preference', 'That produces inconsistent configurations, with no reference to measure drift against.'],
      ['Install every package so nothing is missing later', 'Unneeded software is extra attack surface. Hardening removes it.'],
      ['A secure baseline (e.g. from a CIS benchmark): establish, deploy, maintain', 'A baseline defines the hardened state, deploys it consistently, and is monitored and updated as threats change.'],
      ['Harden servers only after an incident', 'Reactive hardening means the first attacker gets the weak configuration.'],
    ]),
    q('q5', ['4.1'], 'Production servers must run only approved builds that have not been modified since release. Which technique verifies this at install time?', 0, [
      ['Code signing', 'A valid signature proves who published the build and that it has not been altered since it was signed.'],
      ['Static code analysis', 'Static analysis finds flaws in the source before release. It cannot prove the deployed binary is unmodified.'],
      ['Sandboxing', 'A sandbox isolates what code can do when it runs. It does not verify where the code came from.'],
      ['Secure cookies', 'Secure cookies protect session tokens in the browser and have nothing to do with build integrity.'],
    ]),
  ],
  m09: [
    q('q1', ['4.8'], 'Ransomware is actively spreading across the finance VLAN. You have confirmed it. What is the NEXT incident-response activity?', 1, [
      ['Eradication: re-image the infected hosts', 'While it is still spreading, newly re-imaged hosts get reinfected. Contain first.'],
      ['Containment: isolate the finance VLAN', 'Containment stops the spread so eradication and recovery can succeed. Order: detection, analysis, containment, eradication, recovery, lessons learned.'],
      ['Recovery: restore from backups now', 'Restored systems on a live infected network will be encrypted again.'],
      ['Lessons learned: hold the post-incident review', 'Lessons learned comes after recovery, not while the attack is live.'],
    ]),
    q('q2', ['4.8'], 'An infected laptop may become evidence in court. What must you document from the moment you collect it?', 2, [
      ['Root cause analysis', 'RCA explains why the incident happened. It is not an evidence-handling record.'],
      ['E-discovery', 'E-discovery is identifying and producing electronic information for legal proceedings, not proving how the item was handled.'],
      ['Chain of custody', 'A record of who handled the evidence, when and how. Without it, the defense can argue tampering and the evidence may be excluded.'],
      ['Threat hunting', 'Threat hunting is proactively searching for undetected threats, not evidence handling.'],
    ]),
    q('q3', ['3.4'], 'Payroll must be running again within one hour of losing the primary data center. Which recovery site meets that?', 3, [
      ['Cold site', 'A cold site has space and power but no equipment or data. Recovery takes days to weeks.'],
      ['Warm site', 'A warm site has some hardware but needs data restores and configuration, typically hours to days.'],
      ['Restoring onsite backups at the destroyed data center', 'Onsite backups are lost with the site. That is why geographic dispersion matters.'],
      ['Hot site', 'A hot site is fully equipped with near-current data and can take over in minutes to an hour.'],
    ]),
    q('q4', ['4.9'], 'Which data source BEST shows which internal host first connected to the ransomware\u2019s command-and-control IP, and when?', 0, [
      ['Firewall logs / NetFlow records', 'Network logs record source, destination and time for every connection, so filtering on the C2 IP finds patient zero.'],
      ['Vulnerability scan results', 'Scans show weaknesses, not who talked to whom.'],
      ['Badge access logs', 'Badge logs show people entering doors, not hosts making connections.'],
      ['The payroll application\u2019s log', 'An application log records app events, not outbound connections from every host.'],
    ]),
  ],
  m10: [
    q('q1', ['5.3'], 'Before signing, you want the contractual right to inspect the vendor\u2019s security controls yourself. Which clause do you need?', 2, [
      ['Non-disclosure agreement', 'An NDA protects confidential information. It gives you no right to inspect anything.'],
      ['Service-level agreement', 'An SLA sets performance targets like uptime, not audit access.'],
      ['Right-to-audit clause', 'It contractually allows you (or your auditor) to assess the vendor\u2019s controls.'],
      ['Memorandum of understanding', 'An MOU records intent and is generally not binding, so it cannot enforce audits.'],
    ]),
    q('q2', ['5.3'], 'An agreement guarantees 99.9% monthly uptime and gives service credits when it is missed. What type is it?', 0, [
      ['SLA', 'A service-level agreement defines measurable service levels and the remedies when they are missed.'],
      ['MSA', 'A master service agreement sets general terms for future work. Specific metrics usually sit in SLAs or SOWs under it.'],
      ['SOW / work order', 'A statement of work defines a project\u2019s deliverables and timeline, not ongoing uptime.'],
      ['BPA', 'A business partners agreement covers partnership roles, profit and decision-making.'],
    ]),
    q('q3', ['5.2'], 'An asset worth $200,000 would lose 25% of its value in a flood (exposure factor), and floods are expected once every 10 years. What is the ALE?', 3, [
      ['$50,000', 'That is the SLE (asset value x exposure factor), the loss from ONE flood. ALE multiplies it by the yearly rate.'],
      ['$20,000', 'That multiplies the asset value by the ARO and skips the exposure factor.'],
      ['$500,000', 'That multiplies the SLE by 10 years instead of by the ARO (0.1).'],
      ['$5,000', 'SLE = $200,000 x 0.25 = $50,000. ARO = 1/10 = 0.1. ALE = SLE x ARO = $5,000.'],
    ]),
    q('q4', ['5.2'], 'Leadership buys a cyber-insurance policy to cover breach costs. Which risk strategy is this?', 1, [
      ['Mitigate', 'Mitigation reduces likelihood or impact with controls. Insurance changes neither.'],
      ['Transfer', 'Insurance shifts the financial impact to a third party. The risk is transferred, not removed.'],
      ['Accept', 'Accepting means bearing the loss yourself. Here someone else pays.'],
      ['Avoid', 'Avoidance means stopping the risky activity altogether.'],
    ]),
    q('q5', ['3.1'], 'Your company uses a SaaS CRM. Under the shared-responsibility model, who is responsible for configuring user access and for the data users enter?', 2, [
      ['The provider, for everything', 'SaaS shifts the infrastructure and application to the provider, but never your data or your user access decisions.'],
      ['The provider for the data, the customer for the servers', 'Reversed. In SaaS the provider runs the servers and the customer owns its data.'],
      ['The customer', 'In every cloud model the customer stays responsible for its data, identities and access configuration.'],
      ['The customer, including patching the application\u2019s OS', 'In SaaS the provider patches the platform. Patching the OS is the customer\u2019s job only in IaaS.'],
    ]),
    q('q6', ['2.2'], 'Attackers breach a managed service provider and use its remote-management tool to push ransomware to every customer. What is the threat vector?', 0, [
      ['Supply chain (MSP)', 'The attack arrived through a trusted third party\u2019s access. SY0-701 lists MSPs, vendors and suppliers as supply-chain vectors.'],
      ['Watering hole', 'Watering-hole attacks compromise a website the victims visit.'],
      ['Open service ports', 'The attack used the MSP\u2019s legitimate, trusted channel, not an exposed port.'],
      ['Removable device', 'No physical media was involved.'],
    ]),
  ],
  m11: [
    q('q1', ['4.2'], 'Decommissioned SSDs held customer PII. What must happen before they leave the building?', 3, [
      ['A quick format', 'A quick format leaves the data recoverable.'],
      ['Delete the files and empty the recycle bin', 'Deletion removes pointers, not data. Forensic tools recover it easily.'],
      ['Donate them as-is to a school', 'Shipping recoverable PII off-site is a breach waiting to happen.'],
      ['Sanitize (crypto-erase / secure erase) or physically destroy them, and keep a certificate of destruction', 'Sanitization or destruction makes the data unrecoverable, and the certificate proves it for auditors.'],
    ]),
    q('q2', ['5.4'], 'An EU customer asks you to erase all of their personal data. Which privacy concept applies, and what limits it?', 0, [
      ['Right to be forgotten, limited by legal retention obligations', 'Data subjects can request erasure, but data you are legally required to keep, such as tax records, may be retained.'],
      ['Data sovereignty, limited by geolocation', 'Sovereignty is about which country\u2019s laws govern data where it is stored, not erasure requests.'],
      ['Attestation, limited by audit scope', 'Attestation is formally affirming compliance, which has nothing to do with deleting a person\u2019s data.'],
      ['Due care, limited by budget', 'Due care is acting responsibly, but the specific right in play is erasure.'],
    ]),
    q('q3', ['5.5'], 'A penetration-test team is handed network diagrams, source code and test credentials before they start. What kind of test environment is this?', 1, [
      ['Unknown environment', 'Unknown-environment (black-box) testers start with no inside information.'],
      ['Known environment', 'Full disclosure up front (white-box) lets testers go deep quickly.'],
      ['Partially known environment', 'Partially known (gray-box) testers get only limited information, not full diagrams and code.'],
      ['Passive reconnaissance', 'Passive recon is gathering public information without touching the target. It is a technique, not an environment type.'],
    ]),
    q('q4', ['5.4'], 'Your company processes patient data strictly on a hospital\u2019s instructions. Under privacy law, your company is the:', 2, [
      ['Data controller', 'The hospital is the controller: it decides why and how the data is processed.'],
      ['Data subject', 'The patients are the data subjects.'],
      ['Data processor', 'A processor handles personal data on behalf of, and as instructed by, the controller.'],
      ['Data owner', 'The owner is a senior internal role accountable for a data set. It is not the privacy-law term for a service provider.'],
    ]),
    q('q5', ['5.1'], 'Who is ACCOUNTABLE for deciding how the sales data set is classified and who may access it?', 0, [
      ['The data owner', 'The owner, usually a senior business leader, is accountable for classification and access decisions.'],
      ['The data custodian', 'Custodians implement and operate the controls day to day, such as backups and permissions, as the owner directs.'],
      ['The data processor', 'Processors handle data for a controller. They do not set its classification.'],
      ['The help desk', 'The help desk carries out access requests. It does not decide them.'],
    ]),
  ],
  m12: [
    q('q1', ['4.7'], 'A SOAR playbook disables any account that shows impossible travel. A false positive could lock the CEO out mid-deal. What design is BEST?', 3, [
      ['Turn the automation off and handle everything manually', 'This throws away the reaction-time benefit, and attackers act in minutes.'],
      ['Automate it for everyone, with no exceptions', 'There are no guard rails, so one bad signal can disrupt the business at the highest level.'],
      ['Send an email alert only', 'Too slow for an account takeover in progress.'],
      ['Auto-contain standard accounts, require human approval for privileged/VIP accounts, and auto-create and escalate a ticket', 'Guard rails keep automation fast where it is safe and put a human in the loop where the impact is high.'],
    ]),
    q('q2', ['4.7'], 'The single SOAR server that runs every playbook goes down mid-incident, and nobody remembers the manual steps. Which automation consideration was ignored?', 1, [
      ['Workforce multiplier', 'That is a benefit of automation, not the risk that bit the team.'],
      ['Single point of failure / ongoing supportability', 'Automation that everything depends on needs redundancy and maintained manual runbooks.'],
      ['Enforcing baselines', 'Another benefit, unrelated to the outage.'],
      ['Employee retention', 'A benefit (less toil), not the failure here.'],
    ]),
    q('q3', ['4.4'], 'You need one console that aggregates logs from firewalls, servers and endpoints, correlates them, and raises alerts. Which tool is it?', 2, [
      ['NetFlow collector', 'NetFlow gives network flow metadata only, not server or endpoint logs.'],
      ['SNMP traps', 'SNMP traps are device status notifications, not log correlation.'],
      ['SIEM', 'A SIEM aggregates logs across sources, correlates events, and alerts and reports on them.'],
      ['SCAP scanner', 'SCAP is a standard for automated configuration and compliance checks, not log correlation.'],
    ]),
    q('q4', ['3.2'], 'An inline firewall protects the payment segment. Policy says confidentiality outranks availability for card data. If the firewall crashes, it should:', 0, [
      ['Fail closed: block all traffic', 'Failing closed protects confidentiality by sacrificing availability, which matches the stated priority.'],
      ['Fail open: pass all traffic', 'Unfiltered traffic would reach card data, which violates the stated priority.'],
      ['Switch to tap/monitor mode', 'A passive device cannot block anything, so this is effectively failing open.'],
      ['Reboot repeatedly until it recovers', 'That is not a failure-mode design. Traffic handling during the outage is still undefined.'],
    ]),
    q('q5', ['2.5'], 'Automation pushes an application allow list to every kiosk. What is the effect?', 1, [
      ['Known-bad applications are blocked and everything else runs', 'That describes a deny list.'],
      ['Only explicitly approved applications can run, and everything else is blocked', 'Allow listing is default-deny for software, so unknown malware cannot execute.'],
      ['Every application runs inside a sandbox', 'Sandboxing isolates software. It does not decide what may run.'],
      ['Applications auto-update to the latest version', 'That is patching, a different mitigation.'],
    ]),
    q('q6', ['4.4'], 'The SIEM fires 400 "failed login" alerts a day, almost all from one misconfigured service account, and analysts now ignore that rule. What is BEST?', 1, [
      ['Disable the rule', 'You would also lose real password-spraying and brute-force alerts.'],
      ['Fix the service account and tune the rule (a narrow exception or threshold), then validate it still catches real attacks', 'Alert tuning cuts false positives while keeping true positives. Alert fatigue is how real attacks get missed.'],
      ['Hire more analysts to read every alert', 'More people reading noise does not fix the noise.'],
      ['Raise every rule\u2019s threshold tenfold', 'A blanket change hides real attacks across every rule, not just the noisy one.'],
    ]),
  ],
};
