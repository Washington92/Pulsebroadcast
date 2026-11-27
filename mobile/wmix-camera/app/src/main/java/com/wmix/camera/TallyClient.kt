package com.wmix.camera

import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Tally is advisory only; no video capture/transmission is controlled here. */
class TallyClient(private val onState: (String) -> Unit) {
    private val handler = Handler(Looper.getMainLooper())
    private val http = OkHttpClient.Builder().pingInterval(2, TimeUnit.SECONDS).build()
    private var socket: WebSocket? = null
    private var generation = 0
    private var lastSequence = -1L
    private var lastReceivedAt = 0L
    private var expectedCameraId = ""

    private val watchdog = object : Runnable {
        override fun run() {
            if (socket != null) {
                if (android.os.SystemClock.elapsedRealtime() - lastReceivedAt > 5000L) {
                    show("UNKNOWN")
                }
                handler.postDelayed(this, 1000L)
            }
        }
    }

    private fun show(state: String) {
        handler.post { onState(state) }
    }

    fun connect(url: String, cameraId: String, token: String) {
        disconnect()
        require(url.startsWith("wss://")) { "Somente conexões WSS são permitidas" }
        require(cameraId.isNotBlank() && token.isNotBlank()) { "Informe ID e token" }
        generation++
        val currentGeneration = generation
        expectedCameraId = cameraId
        lastSequence = -1L
        lastReceivedAt = android.os.SystemClock.elapsedRealtime()
        show("UNKNOWN")
        val request = Request.Builder().url(url)
            .header("Authorization", "Bearer $token").build()
        socket = http.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                handler.post {
                    if (currentGeneration == generation) lastReceivedAt = android.os.SystemClock.elapsedRealtime()
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val message = try { JSONObject(text) } catch (_: Exception) { return }
                handler.post {
                    if (currentGeneration != generation || message.optString("type") != "tally") return@post
                    if (message.optString("cameraId") != expectedCameraId || !message.has("sequence")) return@post
                    val sequence = message.optLong("sequence", -1L)
                    if (sequence <= lastSequence) return@post
                    val state = message.optString("state")
                    if (state !in setOf("PROGRAM", "PREVIEW", "STANDBY")) return@post
                    lastSequence = sequence
                    lastReceivedAt = android.os.SystemClock.elapsedRealtime()
                    onState(state)
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                handler.post { if (currentGeneration == generation) { socket = null; show("UNKNOWN") } }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                handler.post { if (currentGeneration == generation) { socket = null; show("UNKNOWN") } }
            }
        })
        handler.removeCallbacks(watchdog)
        handler.postDelayed(watchdog, 1000L)
    }

    fun disconnect() {
        generation++
        handler.removeCallbacks(watchdog)
        socket?.close(1000, "disconnect")
        socket = null
        show("UNKNOWN")
    }
}
