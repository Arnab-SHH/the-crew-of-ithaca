import React from 'react'

// The Argo of Ithaca — illustration copied verbatim from friend-ui-demo
export default function ShipPanel({ alert, started, isSunk, onReset }) {
  return (
    <div className={`ship-panel ${alert || isSunk ? 'warn' : ''}`}>
      <div className="panel-head">
        <span>01 &nbsp; THE VESSEL</span>
        <span>{isSunk ? 'HULL BREACHED' : alert ? 'SIRENS NEAR' : 'NORTH BY WEST'}</span>
      </div>
      <div className={`sea ${isSunk ? 'sunk' : ''}`}>
        <div className="moon" />
        <div className="stars">✦ &nbsp; · &nbsp; ˚ &nbsp; ✦ &nbsp; · &nbsp; ˚ &nbsp; ✦</div>
        <svg className="ship-art" viewBox="0 0 720 280" role="img" aria-label="Golden Greek trireme sailing through moonlit water"><title>Moonlit Greek trireme</title><defs><linearGradient id="sail-cloth" x1="0" x2="1"><stop stopColor="#9b8b6e"/><stop offset=".5" stopColor="#d2c09a"/><stop offset="1" stopColor="#a69776"/></linearGradient><linearGradient id="ship-wood" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#9a754d"/><stop offset=".48" stopColor="#715239"/><stop offset="1" stopColor="#42372b"/></linearGradient><linearGradient id="mast-wood" x1="0" x2="1"><stop stopColor="#786246"/><stop offset=".5" stopColor="#ddc18a"/><stop offset="1" stopColor="#786246"/></linearGradient></defs><g fill="none" stroke="#b5a078" strokeOpacity=".7" strokeWidth="2"><path d="M344 49 204 170M425 83 521 169M222 64 476 92"/><path d="M202 175 131 212M242 180 180 222M282 183 230 226M322 184 280 228M362 184 362 229M402 182 444 225M442 179 506 220M482 172 553 206"/></g><path d="M346 57 232 61Q241 112 259 161L346 161Z" fill="url(#sail-cloth)" stroke="#e2d2ad" strokeWidth="2"/><path d="M423 89 355 93Q360 126 369 161L423 161Z" fill="#91917b" stroke="#c6b892" strokeWidth="2"/><g fill="none" stroke="#77694f" strokeOpacity=".62" strokeWidth="1.5"><path d="M260 65 275 160M290 63 300 160M318 60 323 160M371 96 378 160M397 94 401 160"/></g><g stroke="url(#mast-wood)" strokeWidth="5" strokeLinecap="round"><path d="M346 35V173M423 73V174"/><path d="M219 59H350M351 91H429" strokeWidth="4"/></g><path d="M160 170Q265 183 442 178Q520 176 559 158L537 194Q524 211 493 216H229Q193 207 174 187Z" fill="url(#ship-wood)" stroke="#d1b276" strokeWidth="3"/><path d="M175 178Q312 190 548 165M187 188Q312 199 532 180M202 199Q326 208 518 191" fill="none" stroke="#c49d65" strokeOpacity=".62" strokeWidth="2"/><path d="M183 172Q344 181 551 162" fill="none" stroke="#edd49b" strokeWidth="4"/><g fill="#c8ad75" stroke="#473a2b" strokeWidth="2"><circle cx="266" cy="189" r="5"/><circle cx="308" cy="192" r="5"/><circle cx="350" cy="193" r="5"/><circle cx="392" cy="191" r="5"/><circle cx="434" cy="187" r="5"/></g><path d="M554 161q13-7 17-17l6 2q-2 13-12 23l-8-1" fill="#d1b276" stroke="#513f2b" strokeWidth="2"/><g fill="none" stroke="#b1b9a9" strokeOpacity=".62" strokeWidth="2" strokeLinecap="round"><path d="M176 229q42-7 80 0t78 0M294 241q41-6 77 0t71 0M423 228q34-6 68 0t63 0"/></g></svg>
        <div className="horizon" />
        {isSunk && (
          <div className="sunk-banner">
            <strong>The Argo is lost.</strong>
            <span>The Sirens sank the hull. Regroup and sail again.</span>
            <button className="primary" onClick={onReset}>Reset voyage</button>
          </div>
        )}
      </div>
      <div className="ship-caption">
        <span>THE ARGO OF ITHACA</span>
        <span>{isSunk ? 'SHIP LOST' : started ? 'BOUND FOR HOME' : 'AWAITING DEPARTURE'}</span>
      </div>
    </div>
  )
}
