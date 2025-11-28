// Extractor UI Module
import { escapeHtml, copyToClipboard } from './utils.js';

export function initExtractorUI() {
    const extractorBtn = document.getElementById('extractor-btn');
    const extractorModal = document.getElementById('extractor-modal');
    const extractorSearch = document.getElementById('extractor-search');
    const extractorSearchContainer = document.getElementById('extractor-search-container');
    const extractorProgress = document.getElementById('extractor-progress');
    const extractorProgressBar = document.getElementById('extractor-progress-bar');
    const extractorProgressText = document.getElementById('extractor-progress-text');
    const startScanBtn = document.getElementById('start-scan-btn');

    // Results containers
    const secretsResults = document.getElementById('secrets-results');
    const endpointsResults = document.getElementById('endpoints-results');

    // State
    let currentSecretResults = [];
    let currentEndpointResults = [];
    let activeTab = 'secrets';

    // Open Modal
    if (extractorBtn) {
        extractorBtn.addEventListener('click', () => {
            extractorModal.style.display = 'block';
        });
    }

    // Close Modal
    const closeBtn = extractorModal.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            extractorModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === extractorModal) {
            extractorModal.style.display = 'none';
        }
    });

    // Tab switching
    document.querySelectorAll('.extractor-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Update UI
            document.querySelectorAll('.extractor-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');

            // Update state
            activeTab = tabId;

            // Update search placeholder
            if (extractorSearch) {
                extractorSearch.placeholder = activeTab === 'secrets' ? 'Search secrets...' : 'Search endpoints...';
                extractorSearch.value = '';

                // Show/hide search based on results existence
                const hasResults = activeTab === 'secrets' ? currentSecretResults.length > 0 : currentEndpointResults.length > 0;
                extractorSearchContainer.style.display = hasResults ? 'block' : 'none';
            }
        });
    });

    // Start Scan
    if (startScanBtn) {
        startScanBtn.addEventListener('click', async () => {
            extractorProgress.style.display = 'block';
            extractorProgressBar.style.width = '0%';
            extractorProgressText.textContent = 'Scanning JS files...';
            startScanBtn.disabled = true;
            secretsResults.innerHTML = '';
            endpointsResults.innerHTML = '';
            currentSecretResults = [];
            currentEndpointResults = [];
            extractorSearchContainer.style.display = 'none';

            try {
                // Lazy load scanners
                const [secretScanner, endpointExtractor] = await Promise.all([
                    import('./secret-scanner.js'),
                    import('./endpoint-extractor.js')
                ]);

                // Get all resources
                const resources = await new Promise((resolve) => {
                    chrome.devtools.inspectedWindow.getResources((res) => resolve(res));
                });

                const jsFiles = resources.filter(r => r.type === 'script' || r.url.endsWith('.js') || r.url.endsWith('.map'));
                let processed = 0;

                for (const file of jsFiles) {
                    try {
                        const content = await new Promise((resolve) => file.getContent(resolve));
                        if (content) {
                            // Scan for Secrets
                            const secrets = secretScanner.scanContent(content, file.url);
                            currentSecretResults.push(...secrets);

                            // Extract Endpoints
                            const endpoints = endpointExtractor.extractEndpoints(content, file.url);
                            currentEndpointResults.push(...endpoints);
                        }
                    } catch (e) {
                        console.error('Error reading file:', file.url, e);
                    }
                    processed++;
                    const percent = Math.round((processed / jsFiles.length) * 100);
                    extractorProgressBar.style.width = `${percent}%`;
                    extractorProgressText.textContent = `Scanning ${processed}/${jsFiles.length} files...`;
                }

                // Render Results
                renderSecretResults(currentSecretResults);
                renderEndpointResults(currentEndpointResults);

                extractorSearchContainer.style.display = (currentSecretResults.length > 0 || currentEndpointResults.length > 0) ? 'block' : 'none';

            } catch (e) {
                console.error('Scan failed:', e);
                extractorProgressText.textContent = 'Scan failed. Check console.';
            } finally {
                startScanBtn.disabled = false;
                setTimeout(() => {
                    extractorProgress.style.display = 'none';
                }, 2000);
            }
        });
    }

    // Search Logic
    if (extractorSearch) {
        extractorSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();

            if (activeTab === 'secrets') {
                const filtered = currentSecretResults.filter(r =>
                    r.type.toLowerCase().includes(term) ||
                    r.match.toLowerCase().includes(term) ||
                    r.file.toLowerCase().includes(term)
                );
                renderSecretResults(filtered);
            } else {
                const filtered = currentEndpointResults.filter(r =>
                    r.method.toLowerCase().includes(term) ||
                    r.endpoint.toLowerCase().includes(term) ||
                    r.file.toLowerCase().includes(term)
                );
                renderEndpointResults(filtered);
            }
        });
    }

    function renderSecretResults(results) {
        if (results.length === 0) {
            secretsResults.innerHTML = '<div class="empty-state">No secrets found matching your criteria.</div>';
            return;
        }

        let html = '<table class="secrets-table"><thead><tr><th>Type</th><th>Match</th><th>Confidence</th><th>File</th></tr></thead><tbody>';
        results.forEach(r => {
            const confidenceClass = r.confidence >= 80 ? 'high' : (r.confidence >= 50 ? 'medium' : 'low');
            html += `<tr>
                <td>${escapeHtml(r.type)}</td>
                <td class="secret-match" title="${escapeHtml(r.match)}">${escapeHtml(r.match.substring(0, 50))}${r.match.length > 50 ? '...' : ''}</td>
                <td><span class="confidence-badge ${confidenceClass}">${r.confidence}%</span></td>
                <td class="secret-file"><a href="${escapeHtml(r.file)}" target="_blank" title="${escapeHtml(r.file)}">${escapeHtml(r.file.split('/').pop())}</a></td>
            </tr>`;
        });
        html += '</tbody></table>';
        secretsResults.innerHTML = html;
    }

    function renderEndpointResults(results) {
        if (results.length === 0) {
            endpointsResults.innerHTML = '<div class="empty-state">No endpoints found matching your criteria.</div>';
            return;
        }

        let html = '<table class="secrets-table"><thead><tr><th>Method</th><th>Endpoint</th><th>Confidence</th><th>Source File</th><th>Actions</th></tr></thead><tbody>';
        results.forEach((r, index) => {
            const confidenceClass = r.confidence >= 80 ? 'high' : (r.confidence >= 50 ? 'medium' : 'low');
            const methodClass = r.method === 'POST' || r.method === 'PUT' || r.method === 'DELETE' ? 'method-write' : 'method-read';

            // Construct full URL if endpoint is relative
            let fullUrl = r.endpoint;
            if (r.endpoint.startsWith('/') && r.baseUrl) {
                fullUrl = r.baseUrl + r.endpoint;
            }

            html += `<tr>
                <td><span class="http-method ${methodClass}">${escapeHtml(r.method)}</span></td>
                <td class="endpoint-path" title="${escapeHtml(r.endpoint)}">${escapeHtml(r.endpoint)}</td>
                <td><span class="confidence-badge ${confidenceClass}">${r.confidence}%</span></td>
                <td class="secret-file"><a href="${escapeHtml(r.file)}" target="_blank" title="${escapeHtml(r.file)}">${escapeHtml(r.file.split('/').pop())}</a></td>
                <td><button class="copy-url-btn" data-url="${escapeHtml(fullUrl)}" title="Copy full URL">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/>
                    </svg>
                </button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        endpointsResults.innerHTML = html;

        // Add click handlers for copy buttons
        endpointsResults.querySelectorAll('.copy-url-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = btn.getAttribute('data-url');
                copyToClipboard(url);

                // Visual feedback
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg>';
                btn.style.color = '#81c995';
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.style.color = '';
                }, 1000);
            });
        });
    }
}
