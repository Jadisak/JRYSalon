// =================================================================================
// --- CONFIGURATION ---
// =================================================================================

// 1. PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyI6c5msafsPiZA3Zk2MBuom2szPXgyJFCnrocotHtB4QYxoDmHAskRDLZTzJKo6vyzNg/exec"; // <-- PASTE YOUR URL

// 2. PASTE YOUR LIFF ID FROM THE LINE DEVELOPERS CONSOLE HERE
const LIFF_ID = "2007571126-5jj0dZOB"; // <-- PASTE YOUR LIFF ID

// =================================================================================
// --- GLOBAL STATE & DOM ELEMENTS ---
// =================================================================================

// This object holds the current state of the booking process
const bookingState = {
    userId: null,
    userName: null,
    services: [], // all available services from backend
    selectedServices: [], // services the user ticks
    selectedDate: null,
    selectedTime: null,
    totalPrice: 0,
    totalDuration: 0,
    coupon: null, // { code, type, value }
    finalPrice: 0
};

// Quick access to all the important DOM elements
const DOM = {
    loadingScreen: document.getElementById('loading-screen'),
    landingScreen: document.getElementById('landing-screen'),
    bookingScreen: document.getElementById('booking-screen'),
    confirmationScreen: document.getElementById('confirmation-screen'),
    errorScreen: document.getElementById('error-screen'),
    servicesList: document.getElementById('services-list'),
    calendarContainer: document.getElementById('calendar-container'),
    timeSlotsContainer: document.getElementById('time-slots-container'),
    timeSlotsPlaceholder: document.getElementById('time-slots-placeholder'),
    bookingSummary: document.getElementById('booking-summary'),
    couponInput: document.getElementById('coupon-input'),
    couponStatus: document.getElementById('coupon-status'),
    confirmBookingBtn: document.getElementById('confirm-booking-btn'),
    confirmUserName: document.getElementById('confirm-user-name'),
    errorMessage: document.getElementById('error-message'),
};

// =================================================================================
// --- INITIALIZATION ---
// =================================================================================

/**
 * Main entry point, runs when the page is fully loaded.
 */
window.onload = () => {
    initialize();
};

/**
 * Initializes the LIFF app and fetches initial data.
 */
async function initialize() {
    showScreen('loading');
    try {
        await initializeLiff();
        await fetchServices();
        renderCalendar();
        setupEventListeners();
        showScreen('landing');
    } catch (error) {
        console.error("Initialization failed:", error);
        showError(error.message);
    }
}

/**
 * Initializes the LIFF SDK, logs in, and gets the user profile.
 */
async function initializeLiff() {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) {
        liff.login();
        return; // liff.login() redirects, so we stop execution here.
    }
    const profile = await liff.getProfile();
    bookingState.userId = profile.userId;
    bookingState.userName = profile.displayName;
    DOM.confirmUserName.textContent = bookingState.userName;
}


// =================================================================================
// --- API COMMUNICATION ---
// =================================================================================

/**
 * Fetches the list of all services from the backend.
 */
async function fetchServices() {
    const response = await fetch(`${APPS_SCRIPT_URL}?action=getServices`);
    const result = await response.json();
    if (!result.success) throw new Error("Could not fetch services.");
    bookingState.services = result.data;
    renderServices();
}

/**
 * Fetches available time slots for a specific date and duration.
 */
async function fetchAvailability() {
    if (!bookingState.selectedDate || bookingState.totalDuration === 0) {
        DOM.timeSlotsContainer.innerHTML = `<p id="time-slots-placeholder" class="text-gray-500 col-span-3">Please select services and a date first.</p>`;
        return;
    }
    
    DOM.timeSlotsContainer.innerHTML = `<p class="text-gray-500 col-span-3">Checking availability...</p>`;
    const dateStr = bookingState.selectedDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    const url = `${APPS_SCRIPT_URL}?action=getAvailability&date=${dateStr}&duration=${bookingState.totalDuration}`;

    const response = await fetch(url);
    const result = await response.json();
    if (result.success) {
        renderTimeSlots(result.data);
    } else {
        DOM.timeSlotsContainer.innerHTML = `<p class="text-red-500 col-span-3">Could not fetch time slots.</p>`;
    }
}

/**
 * Validates a coupon code with the backend.
 */
async function validateCoupon() {
    const code = DOM.couponInput.value.trim();
    if (!code) return;

    DOM.couponStatus.textContent = "Validating...";
    DOM.couponStatus.className = "text-sm mt-2 text-gray-500";
    
    const response = await fetch(`${APPS_SCRIPT_URL}?action=validateCoupon&code=${code}`);
    const result = await response.json();

    if (result.success && result.data) {
        bookingState.coupon = result.data;
        DOM.couponStatus.textContent = `Coupon "${result.data.code}" applied!`;
        DOM.couponStatus.className = "text-sm mt-2 text-green-600";
    } else {
        bookingState.coupon = null;
        DOM.couponStatus.textContent = "Invalid or expired coupon.";
        DOM.couponStatus.className = "text-sm mt-2 text-red-500";
    }
    updateBookingSummary();
}

/**
 * Submits the final booking to the backend.
 */
async function submitBooking() {
    DOM.confirmBookingBtn.disabled = true;
    DOM.confirmBookingBtn.textContent = "Submitting...";

    const bookingData = {
        userId: bookingState.userId,
        userName: bookingState.userName,
        serviceIds: bookingState.selectedServices.map(s => s.serviceId),
        date: bookingState.selectedDate.toISOString().split('T')[0],
        time: bookingState.selectedTime,
        totalDuration: bookingState.totalDuration,
        finalPrice: bookingState.finalPrice
    };

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Important for simple POST requests to Apps Script
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bookingData)
        });
        // With 'no-cors', we can't read the response, so we just assume it worked.
        // A more advanced setup would handle the response properly.
        showScreen('confirmation');
    } catch (error) {
        console.error("Booking submission failed:", error);
        showError("There was a problem confirming your booking. Please try again.");
    } finally {
        DOM.confirmBookingBtn.disabled = false;
        DOM.confirmBookingBtn.textContent = "Confirm Booking";
    }
}

// =================================================================================
// --- UI RENDERING & UPDATES ---
// =================================================================================

/**
 * Renders the list of services as checkboxes.
 */
function renderServices() {
    DOM.servicesList.innerHTML = '';
    bookingState.services.forEach(service => {
        const div = document.createElement('div');
        div.className = "flex items-center bg-gray-50 p-3 rounded-md";
        div.innerHTML = `
            <input type="checkbox" id="${service.serviceId}" value="${service.serviceId}" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
            <label for="${service.serviceId}" class="ml-3 flex-grow text-sm text-gray-700">${service.name}</label>
            <span class="text-sm font-medium text-gray-900">${service.price} THB</span>
            <span class="text-xs text-gray-500 ml-2">(${service.durationMinutes} min)</span>
        `;
        DOM.servicesList.appendChild(div);
    });
}

/**
 * Renders a simple calendar for the current month.
 */
function renderCalendar() {
    DOM.calendarContainer.innerHTML = '';
    const today = new Date();
    const month = today.getMonth();
    const year = today.getFullYear();

    const monthName = today.toLocaleString('default', { month: 'long' });
    DOM.calendarContainer.innerHTML += `<h3 class="text-center font-bold mb-2">${monthName} ${year}</h3>`;
    
    const daysGrid = document.createElement('div');
    daysGrid.className = 'grid grid-cols-7 gap-1 text-center text-sm';
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
        const dayEl = document.createElement('button');
        dayEl.textContent = i;
        dayEl.className = "p-2 rounded-full hover:bg-blue-200";
        
        const date = new Date(year, month, i);
        // Disable past dates
        if (date < today.setHours(0,0,0,0)) {
            dayEl.disabled = true;
            dayEl.className += " text-gray-400 cursor-not-allowed";
        } else {
             dayEl.onclick = () => handleDateSelect(date, dayEl);
        }
        daysGrid.appendChild(dayEl);
    }
    DOM.calendarContainer.appendChild(daysGrid);
}

/**
 * Renders available time slots as buttons.
 */
function renderTimeSlots(slots) {
    DOM.timeSlotsContainer.innerHTML = '';
    if (slots.length === 0) {
        DOM.timeSlotsContainer.innerHTML = `<p class="text-gray-500 col-span-3">Sorry, no available slots for this day.</p>`;
        return;
    }
    slots.forEach(time => {
        const button = document.createElement('button');
        button.textContent = time;
        button.className = "border border-gray-300 rounded-md p-2 text-sm hover:bg-blue-100";
        button.onclick = () => handleTimeSelect(time, button);
        DOM.timeSlotsContainer.appendChild(button);
    });
}

/**
 * Updates the booking summary section with current selections.
 */
function updateBookingSummary() {
    bookingState.selectedServices = [];
    bookingState.totalPrice = 0;
    bookingState.totalDuration = 0;

    const checkedBoxes = DOM.servicesList.querySelectorAll('input[type=checkbox]:checked');
    checkedBoxes.forEach(box => {
        const service = bookingState.services.find(s => s.serviceId === box.value);
        if (service) {
            bookingState.selectedServices.push(service);
            bookingState.totalPrice += service.price;
            bookingState.totalDuration += service.durationMinutes;
        }
    });

    if (bookingState.selectedServices.length === 0) {
        DOM.bookingSummary.innerHTML = `<p>No services selected yet.</p>`;
        bookingState.finalPrice = 0;
    } else {
        let summaryHtml = ``;
        bookingState.selectedServices.forEach(s => {
            summaryHtml += `<p class="flex justify-between"><span>${s.name}</span> <span>${s.price} THB</span></p>`;
        });
        summaryHtml += `<hr class="my-2">`;
        summaryHtml += `<p class="flex justify-between font-semibold"><span>Subtotal</span> <span>${bookingState.totalPrice} THB</span></p>`;
        
        let finalPrice = bookingState.totalPrice;
        if(bookingState.coupon) {
            let discount = 0;
            if (bookingState.coupon.type === 'PERCENTAGE') {
                discount = (finalPrice * bookingState.coupon.value) / 100;
                summaryHtml += `<p class="flex justify-between text-green-600"><span>Discount (${bookingState.coupon.value}%)</span> <span>-${discount.toFixed(2)} THB</span></p>`;
            } else if (bookingState.coupon.type === 'FIXED') {
                discount = bookingState.coupon.value;
                 summaryHtml += `<p class="flex justify-between text-green-600"><span>Discount</span> <span>-${discount.toFixed(2)} THB</span></p>`;
            }
            finalPrice -= discount;
        }
        bookingState.finalPrice = finalPrice < 0 ? 0 : finalPrice;
        
        summaryHtml += `<p class="flex justify-between text-lg font-bold mt-2"><span>Total</span> <span>${bookingState.finalPrice.toFixed(2)} THB</span></p>`;
        DOM.bookingSummary.innerHTML = summaryHtml;
    }
    
    // Fetch new time slots if date is already selected
    if(bookingState.selectedDate) {
        fetchAvailability();
    }
    
    updateConfirmButtonState();
}

/**
 * Enables or disables the final confirmation button based on state.
 */
function updateConfirmButtonState() {
    if (bookingState.selectedServices.length > 0 && bookingState.selectedDate && bookingState.selectedTime) {
        DOM.confirmBookingBtn.disabled = false;
    } else {
        DOM.confirmBookingBtn.disabled = true;
    }
}

// =================================================================================
// --- EVENT HANDLERS ---
// =================================================================================

/**
 * Sets up all the initial event listeners for buttons and inputs.
 */
function setupEventListeners() {
    document.getElementById('start-booking-btn').addEventListener('click', () => showScreen('booking'));
    
    // Use event delegation for service checkboxes
    DOM.servicesList.addEventListener('change', (event) => {
        if (event.target.type === 'checkbox') {
            updateBookingSummary();
        }
    });
    
    document.getElementById('apply-coupon-btn').addEventListener('click', validateCoupon);
    DOM.confirmBookingBtn.addEventListener('click', submitBooking);
    document.getElementById('close-liff-btn').addEventListener('click', () => liff.closeWindow());
}

function handleDateSelect(date, element) {
    // Clear previous selection
    document.querySelectorAll('.selected-date').forEach(el => el.classList.remove('selected-date'));
    // Highlight new selection
    element.classList.add('selected-date');
    
    bookingState.selectedDate = date;
    bookingState.selectedTime = null; // Reset time when date changes
    renderTimeSlots([]); // Clear old slots
    fetchAvailability();
    updateConfirmButtonState();
}

function handleTimeSelect(time, element) {
    // Clear previous selection
    document.querySelectorAll('.selected-time').forEach(el => el.classList.remove('selected-time'));
    // Highlight new selection
    element.classList.add('selected-time');
    
    bookingState.selectedTime = time;
    updateConfirmButtonState();
}


// =================================================================================
// --- UI UTILITIES ---
// =================================================================================

/**
 * A simple router to show one screen at a time.
 * @param {'loading' | 'landing' | 'booking' | 'confirmation' | 'error'} screenName 
 */
function showScreen(screenName) {
    DOM.loadingScreen.classList.add('hidden');
    DOM.landingScreen.classList.add('hidden');
    DOM.bookingScreen.classList.add('hidden');
    DOM.confirmationScreen.classList.add('hidden');
    DOM.errorScreen.classList.add('hidden');
    
    switch(screenName) {
        case 'landing': DOM.landingScreen.classList.remove('hidden'); break;
        case 'booking': DOM.bookingScreen.classList.remove('hidden'); break;
        case 'confirmation': DOM.confirmationScreen.classList.remove('hidden'); break;
        case 'error': DOM.errorScreen.classList.remove('hidden'); break;
        default: DOM.loadingScreen.classList.remove('hidden'); break;
    }
}

/**
 * Displays the error screen with a specific message.
 * @param {string} message - The error message to show.
 */
function showError(message) {
    DOM.errorMessage.textContent = message;
    showScreen('error');
}
// ตัวอย่างการเรียกใช้หลัง createBooking
// var userId = data.userId; // หรือระบุ userId ที่ต้องการ
// sendLineFlexMessage(userId, flexContent);
