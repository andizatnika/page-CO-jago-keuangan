/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    // Redirect to checkout.html if the user lands on the root
    window.location.href = '/checkout.html';
  }, []);

  return (
    <div className="min-h-screen bg-[#0B2818] flex items-center justify-center text-white font-sans">
      <div class="text-center animate-pulse">
        <div class="text-2xl font-bold text-[#10B981] mb-2">Keuangan.AI</div>
        <p class="text-gray-400">Mengarahkan ke halaman checkout...</p>
      </div>
    </div>
  );
}
