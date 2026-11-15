package com.wmix.camera

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {
    private lateinit var preview: PreviewView
    private lateinit var tally: TextView
    private lateinit var status: TextView
    private lateinit var client: TallyClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        client = TallyClient { renderTally(it) }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(17, 19, 24))
            setPadding(20, 20, 20, 20)
        }

        tally = TextView(this).apply {
            gravity = Gravity.CENTER
            textSize = 25f
            setTextColor(Color.WHITE)
            setPadding(12, 20, 12, 20)
        }
        root.addView(tally, LinearLayout.LayoutParams(-1, -2))

        preview = PreviewView(this)
        root.addView(preview, LinearLayout.LayoutParams(-1, 0, 1f))

        fun field(hintText: String): EditText = EditText(this).also {
            it.hint = hintText
            it.setSingleLine(true)
            it.setTextColor(Color.WHITE)
            it.setHintTextColor(Color.LTGRAY)
            root.addView(it, LinearLayout.LayoutParams(-1, -2))
        }

        val endpoint = field("wss://servidor/tally")
        val cameraId = field("ID da câmera (ex.: cam-01)")
        val token = field("Token de pareamento").apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
        }

        status = TextView(this).apply { setTextColor(Color.LTGRAY) }
        root.addView(status)

        val connect = Button(this).apply { text = "Conectar Tally" }
        root.addView(connect)
        connect.setOnClickListener {
            try {
                client.connect(endpoint.text.toString().trim(), cameraId.text.toString().trim(), token.text.toString())
                status.text = "Tentando conexão segura…"
            } catch (ex: Exception) {
                status.text = ex.message ?: "Falha na conexão"
            }
        }
        val disconnect = Button(this).apply { text = "Desconectar" }
        root.addView(disconnect)
        disconnect.setOnClickListener { client.disconnect(); status.text = "Desconectado" }

        setContentView(root)
        renderTally("UNKNOWN")
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED) startCamera()
        else ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 100)
    }

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            try {
                val provider = future.get()
                val cameraPreview = Preview.Builder().build()
                cameraPreview.surfaceProvider = preview.surfaceProvider
                provider.unbindAll()
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, cameraPreview)
            } catch (ex: Exception) {
                Toast.makeText(this, "Falha ao abrir câmera: ${ex.message}", Toast.LENGTH_LONG).show()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun renderTally(state: String) {
        val (caption, color) = when (state) {
            "PROGRAM" -> "● NO AR / PROGRAM" to Color.rgb(211, 32, 46)
            "PREVIEW" -> "● PREVIEW" to Color.rgb(30, 146, 78)
            "STANDBY" -> "● EM ESPERA" to Color.rgb(75, 81, 91)
            else -> "● SEM SINAL TALLY" to Color.rgb(80, 80, 80)
        }
        tally.text = caption
        tally.setBackgroundColor(color)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 100 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        }
    }

    override fun onDestroy() {
        client.disconnect()
        super.onDestroy()
    }
}
