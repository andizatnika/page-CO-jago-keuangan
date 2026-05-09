import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import emailjs from '@emailjs/browser';

/**
 * CONFIGURATIONS
 */
const BANK_ACCOUNTS: Record<string, { name: string; rek: string; an: string }> = {
  bri: { name: 'Bank BRI', rek: '009201001828567', an: 'ANDI ZATNIKA' },
  mandiri: { name: 'Bank Mandiri', rek: '1820004264586', an: 'ANDI ZATNIKA' },
  bca: { name: 'Bank BCA', rek: '0383175779', an: 'HANA SUNDARI PUTRI' }
};

const GSHEETS_URL = 'https://script.google.com/macros/s/AKfycbxD29eqPOOhXWBlsDQ5CXI1rMVYPUBpskr8T0Ak6B7MrXptHuuQpD5VLlR1ov_z4zzhTw/exec';

const EMAILJS_CONFIG = {
  SERVICE_ID: 'service_euvp1wfa',
  TEMPLATE_ID: 'template_f0vdyjr',
  PUBLIC_KEY: 'IjIwx_pBHLVTEbyrr'
};

const WA_ADMIN_NUMBER = '6283892802483';

/**
 * STATE
 */
let currentStep = 1;
let orderData: any = null;
let uniquePrice = 0;
let priceStr = '';
let selectedFile: File | null = null;
let imageBase64: string | null = null;

/**
 * INITIALIZE FIREBASE
 */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

/**
 * UI HELPERS
 */
const showStep = (idx: number) => {
  currentStep = idx;
  const steps = [1, 2, 3];
  steps.forEach(s => {
    const el = document.getElementById(`step-${s}`);
    if (el) {
      if (s === idx) {
        el.className = 'visible-step';
      } else {
        el.className = 'hidden-step';
      }
    }
  });

  // Progress Bar
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const progressPercent = document.getElementById('progress-percent');
  const progressContainer = document.getElementById('progress-container');

  if (idx === 3) {
    if (progressContainer) progressContainer.classList.add('hidden');
  } else {
    if (progressContainer) progressContainer.classList.remove('hidden');
    const pct = idx === 1 ? 50 : 100;
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressText) progressText.innerText = `Langkah ${idx} dari 2`;
    if (progressPercent) progressPercent.innerText = `${pct}%`;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const renderBankInfo = () => {
  const rekCard = document.getElementById('rek-card');
  const selectedBankKey = (document.querySelector('input[name="bank"]:checked') as HTMLInputElement)?.value || 'bri';
  const bankInfo = BANK_ACCOUNTS[selectedBankKey];

  if (rekCard && bankInfo) {
    rekCard.innerHTML = `
      <div class="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-4">
        <div class="flex items-center justify-between">
          <div class="text-xs font-bold text-gray-400 uppercase tracking-widest">Tujuan Transfer</div>
          <div class="px-2 py-1 rounded bg-white/10 text-[10px] font-bold text-gray-300 uppercase">${bankInfo.name}</div>
        </div>
        <div class="flex items-center justify-between group">
          <div class="text-2xl font-black text-white tracking-widest">${bankInfo.rek}</div>
          <button id="btn-copy-rek" type="button" class="p-2 hover:bg-emerald/10 rounded-lg transition text-gray-400 hover:text-emerald" title="Salin Rekening">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="copy-icon-rek"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
        <div class="pt-4 border-t border-white/5">
          <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Nama Penerima</div>
          <div class="text-sm font-bold text-gray-200">${bankInfo.an}</div>
        </div>
      </div>
    `;

    // Add copy listener
    document.getElementById('btn-copy-rek')?.addEventListener('click', () => {
      copyToClipboard(bankInfo.rek, 'copy-icon-rek');
    });
  }
};

const copyToClipboard = async (text: string, iconId: string) => {
  try {
    await navigator.clipboard.writeText(text);
    const icon = document.getElementById(iconId);
    if (icon) {
      const originalHTML = icon.innerHTML;
      icon.innerHTML = '<path d="M20 6L9 17l-5-5" />';
      setTimeout(() => {
        icon.innerHTML = originalHTML;
      }, 2000);
    }
  } catch (err) {
    console.error('Failed to copy: ', err);
  }
};

const handleFile = (file: File) => {
  if (!file.type.startsWith('image/')) {
    alert('Hanya file gambar yang diperbolehkan (JPG, PNG, WEBP).');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('Ukuran file terlalu besar (maksimal 5MB).');
    return;
  }

  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    imageBase64 = e.target?.result as string;
    const previewImage = document.getElementById('preview-image') as HTMLImageElement;
    const fileName = document.getElementById('file-name');
    const uploadPrompt = document.getElementById('upload-prompt');
    const uploadPreview = document.getElementById('upload-preview');
    const btnConfirm = document.getElementById('btn-confirm') as HTMLButtonElement;

    if (previewImage) previewImage.src = imageBase64!;
    if (fileName) fileName.innerText = file.name;
    if (uploadPrompt) uploadPrompt.classList.add('hidden');
    if (uploadPreview) uploadPreview.classList.remove('hidden');
    
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.classList.remove('bg-gray-800', 'text-gray-400', 'cursor-not-allowed');
      btnConfirm.classList.add('bg-emerald', 'text-darkgreen', 'hover:bg-emerald/90', 'shadow-emerald/20');
    }
  };
  reader.readAsDataURL(file);
};

const verifyReceiptAI = async (
  base64: string,
  price: string,
  bank: string
): Promise<{ isValid: boolean; reason: string }> => {
  const response = await fetch('/api/verify-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64, expectedPrice: price.replace('Rp ', ''), expectedBank: bank })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.reason || `Server error: ${response.status}`);
  }

  return await response.json();
};

/**
 * CORE ACTIONS
 */
const init = () => {
  // Generate/Restore unique price
  const savedPrice = sessionStorage.getItem('unique_price');
  if (savedPrice) {
    uniquePrice = parseInt(savedPrice);
  } else {
    uniquePrice = 99000 + Math.floor(Math.random() * 999) + 1;
    sessionStorage.setItem('unique_price', uniquePrice.toString());
  }
  priceStr = 'Rp ' + uniquePrice.toLocaleString('id-ID');

  const promoPriceEl = document.getElementById('promo-price');
  const displayPriceEl = document.getElementById('display-price');
  if (promoPriceEl) promoPriceEl.innerText = priceStr;
  if (displayPriceEl) displayPriceEl.innerText = priceStr;

  // Restore step if exists
  const urlParams = new URLSearchParams(window.location.search);
  const stepParam = urlParams.get('step');
  const cachedOrder = sessionStorage.getItem('order_cache');
  if (stepParam === '2' && cachedOrder) {
    orderData = JSON.parse(cachedOrder);
    // Fill step 1 inputs for consistency if needed, but just show step 2
    showStep(2);
    renderBankInfo();
  }

  // EVENT LISTENERS - STEP 1
  document.getElementById('toggle-password')?.addEventListener('click', () => {
    const pwdInput = document.getElementById('password') as HTMLInputElement;
    if (pwdInput) {
      pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
    }
  });

  document.getElementById('btn-next')?.addEventListener('click', async () => {
    const nama = (document.getElementById('nama') as HTMLInputElement)?.value.trim();
    const email = (document.getElementById('email') as HTMLInputElement)?.value.trim();
    const password = (document.getElementById('password') as HTMLInputElement)?.value;
    const confirmPassword = (document.getElementById('confirm-password') as HTMLInputElement)?.value;
    const whatsapp = (document.getElementById('whatsapp') as HTMLInputElement)?.value.trim();
    const selectedBankKey = (document.querySelector('input[name="bank"]:checked') as HTMLInputElement)?.value;

    // Validation
    if (!nama || !email || !password || !confirmPassword || !whatsapp) {
      alert('Semua field wajib diisi!');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('Format email tidak valid!');
      return;
    }
    if (password.length < 8) {
      alert('Password minimal 8 karakter!');
      return;
    }
    if (password !== confirmPassword) {
      alert('Password dan Konfirmasi Password tidak cocok!');
      return;
    }

    orderData = { name: nama, email, password, wa: whatsapp, bank: selectedBankKey };
    sessionStorage.setItem('order_cache', JSON.stringify(orderData));

    // Send Invoice Email via EmailJS
    const bankInfo = BANK_ACCOUNTS[selectedBankKey!];
    emailjs.send(
      EMAILJS_CONFIG.SERVICE_ID,
      EMAILJS_CONFIG.TEMPLATE_ID,
      {
        to_name: nama,
        to_email: email,
        amount: priceStr,
        bank_name: bankInfo.name,
        rek_num: bankInfo.rek,
        rek_an: bankInfo.an,
        checkout_url: window.location.origin + '/checkout?step=2'
      },
      EMAILJS_CONFIG.PUBLIC_KEY
    ).catch(err => console.error('EmailJS Error:', err));

    showStep(2);
    renderBankInfo();
  });

  // EVENT LISTENERS - STEP 2
  document.getElementById('btn-back')?.addEventListener('click', () => {
    showStep(1);
  });

  document.getElementById('btn-copy-amount')?.addEventListener('click', () => {
    copyToClipboard(uniquePrice.toString(), 'display-price'); // Adjusted icon ID to copy from text
  });

  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const dropArea = document.getElementById('drop-area');

  dropArea?.addEventListener('click', () => fileInput?.click());
  
  dropArea?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.classList.add('dragover');
  });
  
  dropArea?.addEventListener('dragleave', () => {
    dropArea.classList.remove('dragover');
  });

  dropArea?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  });

  fileInput?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleFile(file);
  });

  document.getElementById('remove-file')?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    imageBase64 = null;
    if (fileInput) fileInput.value = '';
    
    document.getElementById('upload-prompt')?.classList.remove('hidden');
    document.getElementById('upload-preview')?.classList.add('hidden');
    
    const btnConfirm = document.getElementById('btn-confirm') as HTMLButtonElement;
    btnConfirm.disabled = true;
    btnConfirm.classList.add('bg-gray-800', 'text-gray-400', 'cursor-not-allowed');
    btnConfirm.classList.remove('bg-emerald', 'text-darkgreen', 'hover:bg-emerald/90');
  });

  document.getElementById('btn-confirm')?.addEventListener('click', async () => {
    if (!imageBase64 || !orderData) return;

    const btnConfirm = document.getElementById('btn-confirm') as HTMLButtonElement;
    const btnText = document.getElementById('btn-confirm-text');
    const btnSpinner = document.getElementById('btn-spinner');
    const verifyMsg = document.getElementById('verify-message');

    // UI Loading state
    btnConfirm.disabled = true;
    btnText!.classList.add('hidden');
    btnSpinner!.classList.remove('hidden');
    verifyMsg!.classList.remove('hidden');

    try {
      const bankInfo = BANK_ACCOUNTS[orderData.bank];
      const result = await verifyReceiptAI(imageBase64, priceStr, bankInfo.name);

      if (result.isValid) {
        // AI Verified! Proceed with account creation
        
        // 1. Create Firebase Auth User
        const userCredential = await createUserWithEmailAndPassword(auth, orderData.email, orderData.password);
        const user = userCredential.user;

        // 2. Save User Profile to Firestore
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        await setDoc(doc(db, 'users', user.uid), {
          name: orderData.name,
          email: orderData.email,
          whatsapp: orderData.wa,
          role: 'user',
          isVerified: true,
          expiresAt: expiresAt,
          createdAt: serverTimestamp()
        });

        // 3. Log to Google Sheets (fire and forget)
        fetch(GSHEETS_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: orderData.name,
            email: orderData.email,
            wa: orderData.wa,
            bank: orderData.bank.toUpperCase(),
            amount: uniquePrice,
            status: 'AUTO_VERIFIED'
          })
        }).catch(err => console.error('GSheets Error:', err));

        // 4. Success Step
        document.getElementById('success-name')!.innerText = orderData.name;
        document.getElementById('success-email')!.innerText = orderData.email;
        
        sessionStorage.removeItem('order_cache');
        sessionStorage.removeItem('unique_price');
        
        showStep(3);
      } else {
        alert(`Verifikasi Gagal: ${result.reason}`);
        // Reset UI
        btnConfirm.disabled = false;
        btnText!.classList.remove('hidden');
        btnSpinner!.classList.add('hidden');
        verifyMsg!.classList.add('hidden');
      }
    } catch (err: any) {
      console.error('Verification Error:', err);
      alert(`Terjadi kesalahan: ${err.message || 'Gagal memproses verifikasi.'}`);
      // Reset UI
      btnConfirm.disabled = false;
      btnText!.classList.remove('hidden');
      btnSpinner!.classList.add('hidden');
      verifyMsg!.classList.add('hidden');
    }
  });

  document.getElementById('btn-manual-wa')?.addEventListener('click', () => {
    if (!orderData) return;
    const bankInfo = BANK_ACCOUNTS[orderData.bank];
    const message = `Halo Admin, Saya ingin konfirmasi pembayaran *Assistant Keuangan AI*.\n\n👤 Nama: ${orderData.name}\n📧 Email: ${orderData.email}\n💰 Nominal: ${priceStr}\n🏦 Bank: ${bankInfo.name}\n\nMohon bantuannya untuk aktifkan akun saya.`;
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${WA_ADMIN_NUMBER}?text=${encoded}`, '_blank');
  });
};

/**
 * START
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
