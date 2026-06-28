# Android SMS Gateway Integration Guide

This guide explains how to set up an Android device to capture SMS notifications (from Vodafone Cash and InstaPay) and automatically forward them to your deployed Next.js endpoint.

---

## Webhook Endpoint Details

The Android gateway must send a HTTP `POST` request to:
`https://<your-domain>.vercel.app/api/sms`

### Required Headers:
- `Content-Type`: `application/json`
- `x-api-key`: `<Your-Secret-API-Key>` (Configured as `SMS_GATEWAY_API_KEY` in environment variables)

### Request Body JSON:
```json
{
  "sender": "%SMSRF", 
  "message": "%SMSRB", 
  "receivedAt": "%DATE_ISO"
}
```

---

## 1. Setting up Tasker (Recommended)

Tasker is a highly robust automation app for Android.

### Step 1: Create a Profile
1. Open Tasker, go to the **Profiles** tab, and click **+**.
2. Select **Event** -> **Phone** -> **Received Text**.
3. Set the parameters:
   - **Type**: `SMS`
   - **Sender**: `Vodafone Cash / InstaPay` (or leave blank to process all, filtering will occur on the server).
4. Go back to save the Profile.

### Step 2: Create the Task
1. When prompted, select **New Task** and name it `Forward SMS`.
2. Click **+** to add an Action:
   - Search for **Variable Set**.
   - **Name**: `%received_at`
   - **To**: `%TIME` (or run a JavaScript script to get ISO format: `new Date().toISOString()`).
3. Click **+** to add another Action:
   - Search for **Net** -> **HTTP Request**.
   - **Method**: `POST`
   - **URL**: `https://<your-domain>.vercel.app/api/sms`
   - **Headers**:
     ```text
     Content-Type: application/json
     x-api-key: your-secret-api-key-here
     ```
   - **Body**:
     ```json
     {
       "sender": "%SMSRF",
       "message": "%SMSRB",
       "receivedAt": "%received_at"
     }
     ```
4. Test the task by sending a test SMS to the device.

---

## 2. Setting up MacroDroid

MacroDroid is an easy-to-use alternative with a visual editor.

### Step 1: Create a Macro
1. Open MacroDroid and tap **Add Macro**.
2. Name it `Forward SMS to Webhook`.

### Step 2: Add Trigger
1. In the red **Triggers** section, tap **+**.
2. Select **Device Events** -> **SMS Received**.
3. Choose **Select Number(s)** and add `Vodafone Cash` and `InstaPay` (or set to Any Number).
4. Select **Any Content**.

### Step 3: Add Action
1. In the blue **Actions** section, tap **+**.
2. Select **Applications** -> **HTTP GET/POST** (or **Web Request**).
3. Set parameters:
   - **Method**: `POST`
   - **URL**: `https://<your-domain>.vercel.app/api/sms`
   - **Query Parameters / Headers**: Add header `x-api-key: your-secret-api-key-here`.
   - **Content Type**: `application/json`
   - **Request Body (JSON)**:
     ```json
     {
       "sender": "{sms_number}",
       "message": "{sms_message}",
       "receivedAt": "{year}-{month_num}-{day_of_month}T{hour}:{minute}:00"
     }
     ```

---

## 3. Custom Android App Implementation (Kotlin)

If you prefer building a lightweight dedicated app, use a `BroadcastReceiver` listening to `android.provider.Telephony.SMS_RECEIVED`.

### Step 1: AndroidManifest.xml permissions
```xml
<uses-permission android:name="android.permission.RECEIVE_SMS" />
<uses-permission android:name="android.permission.INTERNET" />

<receiver android:name=".SMSReceiver" android:exported="true">
    <intent-filter>
        <action android:name="android.provider.Telephony.SMS_RECEIVED" />
    </intent-filter>
</receiver>
```

### Step 2: SMSReceiver.kt Broadcast Receiver
```kotlin
package com.example.smsgateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.*

class SMSReceiver : BroadcastReceiver() {
    private val client = OkHttpClient()
    private val webhookUrl = "https://your-domain.vercel.app/api/sms"
    private val apiKey = "your-secret-api-key-here"

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            for (sms in messages) {
                val sender = sms.displayOriginatingAddress
                val body = sms.displayMessageBody
                val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US).format(Date(sms.timestampMillis))

                // Filter incoming senders if needed (e.g. Vodafone Cash, InstaPay)
                if (sender.contains("Vodafone", ignoreCase = true) || sender.contains("IPN", ignoreCase = true) || sender.contains("InstaPay", ignoreCase = true)) {
                    forwardSMSToWebhook(sender, body, timestamp)
                }
            }
        }
    }

    private fun forwardSMSToWebhook(sender: String, message: String, receivedAt: String) {
        val json = JSONObject().apply {
            put("sender", sender)
            put("message", message)
            put("receivedAt", receivedAt)
        }

        val mediaType = "application/json; charset=utf-8".toMediaType()
        val requestBody = json.toString().toRequestBody(mediaType)

        val request = Request.Builder()
            .url(webhookUrl)
            .addHeader("x-api-key", apiKey)
            .post(requestBody)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("SMSReceiver", "Webhook POST request failed", e)
            }

            override fun onResponse(call: Call, response: Response) {
                Log.d("SMSReceiver", "Webhook POST successful: ${response.code}")
                response.close()
            }
        })
    }
}
```
