package com.wmix.camera

import android.Manifest
import android.content.pm.PackageManager
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import kotlin.math.roundToInt

/**
 * First operational camera console.
 * Camera preview, zoom, EV, torch, camera switching, tap-to-focus and Tally border are real.
 * Video streaming, RGB scopes, audio metering and manual ISO/shutter are NOT implemented.
 */
class MainActivity : ComponentActivity() {
    private val bg = Color.rgb(12, 16, 21)
    private val panel = Color.rgb(26, 32, 40)
    private val white = Color.rgb(240, 244, 247)
    private val dim = Color.rgb(163, 175, 186)
    private val green = Color.rgb(52, 220, 119)
    private lateinit var preview: PreviewView
    private lateinit var frame: FrameLayout
    private lateinit var tallyDot: TextView
    private lateinit var cameraStatus: TextView
    private lateinit var zoomValue: TextView
    private lateinit var evValue: TextView
    private lateinit var zoomSeek: SeekBar
    private lateinit var evSeek: SeekBar
    private lateinit var lensButton: Button
    private lateinit var torchButton: Button
    private lateinit var client: TallyClient

    private var camera: Camera? = null
    private var provider: ProcessCameraProvider? = null
    private var selector = CameraSelector.DEFAULT_BACK_CAMERA
    private var torchEnabled = false

    private fun dp(n: Int) = (n * resources.displayMetrics.density).roundToInt()
    private fun rounded(color: Int, borderColor: Int? = null, stroke: Int = 1): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(13).toFloat()
            if (borderColor != null) setStroke(dp(stroke), borderColor)
        }

    private fun label(value: String, size: Float = 13f, color: Int = white): TextView =
        TextView(this).apply {
            text = value
            textSize = size
            setTextColor(color)
            gravity = Gravity.CENTER_VERTICAL
        }

    private fun button(value: String, action: () -> Unit): Button =
        Button(this).apply {
            text = value
            isAllCaps = false
            setTextColor(white)
            textSize = 12f
            background = rounded(panel, Color.rgb(57, 67, 78))
            setOnClickListener { action() }
        }

    private fun section(title: String): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(10), dp(7), dp(10), dp(7))
            background = rounded(panel)
            addView(label(title, 11f, dim))
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        window.statusBarColor = bg
        window.navigationBarColor = bg
        client = TallyClient { renderTally(it) }
        buildConsole()
        renderTally("UNKNOWN")
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED) startCamera()
        else ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 100)
    }

    private fun unavailable(feature: String) {
        Toast.makeText(this, "$feature: recurso ainda não implementado", Toast.LENGTH_SHORT).show()
    }

    private fun infoPopup(anchor: View, title: String, options: List<String>) {
        val popup = PopupMenu(this, anchor)
        options.forEachIndexed { index, option ->
            popup.menu.add(0, index, index, option).isEnabled = false
        }
        popup.menu.add(0, 99, options.size, "Ainda não disponível")
        popup.setOnMenuItemClickListener { unavailable(title); true }
        popup.show()
    }

    private fun buildConsole() {
        // Camera preview remains full-screen; controls float over the picture.
        val root = FrameLayout(this).apply { setBackgroundColor(bg) }
        frame = FrameLayout(this).apply {
            setPadding(dp(4), dp(4), dp(4), dp(4))
            background = rounded(bg, Color.rgb(43, 50, 58), 4)
        }
        root.addView(frame, FrameLayout.LayoutParams(-1, -1))
        preview = PreviewView(this).apply { scaleType = PreviewView.ScaleType.FIT_CENTER }
        frame.addView(preview, FrameLayout.LayoutParams(-1, -1))
        preview.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_UP) {
                val point = preview.meteringPointFactory.createPoint(event.x, event.y)
                camera?.cameraControl?.startFocusAndMetering(
                    FocusMeteringAction.Builder(point).build()
                )
                cameraStatus.text = "Foco por toque"
            }
            true
        }

        val overlay = FrameLayout(this)
        // Overlay is inside the Tally border; frame corners remain visible.
        frame.addView(overlay, FrameLayout.LayoutParams(-1, -1))

        fun floatingBar(): LinearLayout = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(9), dp(4), dp(9), dp(4))
            background = rounded(Color.argb(204, 14, 19, 27))
        }

        val top = floatingBar()
        val brand = label("wMix Camera", 16f).apply { setTypeface(null, Typeface.BOLD) }
        top.addView(brand, LinearLayout.LayoutParams(0, dp(36), 1f))
        cameraStatus = label("Iniciando câmera", 11f, dim)
        top.addView(cameraStatus)
        top.addView(label("   CAM 01   ", 12f, white))
        tallyDot = label("●", 24f, dim)
        top.addView(tallyDot)
        top.addView(button("Conexão") { openConnectionDialog() },
            LinearLayout.LayoutParams(dp(92), dp(34)))
        overlay.addView(top, FrameLayout.LayoutParams(-1, dp(46), Gravity.TOP).apply {
            leftMargin = dp(6); rightMargin = dp(6); topMargin = dp(6)
        })

        // Left rail: camera-specific actions, not a large sidebar.
        val left = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(Color.argb(196, 14, 19, 27))
            setPadding(dp(4), dp(6), dp(4), dp(6))
        }
        lensButton = button("↺") { switchCamera() }
        left.addView(lensButton, LinearLayout.LayoutParams(dp(52), dp(47)))
        torchButton = button("☼") { toggleTorch() }
        left.addView(torchButton, LinearLayout.LayoutParams(dp(52), dp(47)).apply { topMargin = dp(5) })
        left.addView(button("⊞") { unavailable("Grade") },
            LinearLayout.LayoutParams(dp(52), dp(47)).apply { topMargin = dp(5) })
        overlay.addView(left, FrameLayout.LayoutParams(dp(64), -2, Gravity.START or Gravity.CENTER_VERTICAL).apply {
            leftMargin = dp(9)
        })

        // Right rail: zoom shortcuts and camera action.
        val right = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(Color.argb(196, 14, 19, 27))
            setPadding(dp(4), dp(6), dp(4), dp(6))
        }
        right.addView(button("1×") {
            val state = camera?.cameraInfo?.zoomState?.value
            if (state != null) camera?.cameraControl?.setZoomRatio(1f.coerceIn(state.minZoomRatio, state.maxZoomRatio))
        }, LinearLayout.LayoutParams(dp(54), dp(43)))
        right.addView(button("2×") {
            val state = camera?.cameraInfo?.zoomState?.value
            if (state != null) camera?.cameraControl?.setZoomRatio(2f.coerceIn(state.minZoomRatio, state.maxZoomRatio))
        }, LinearLayout.LayoutParams(dp(54), dp(43)).apply { topMargin = dp(5) })
        right.addView(button("5×") {
            val state = camera?.cameraInfo?.zoomState?.value
            if (state != null) camera?.cameraControl?.setZoomRatio(5f.coerceIn(state.minZoomRatio, state.maxZoomRatio))
        }, LinearLayout.LayoutParams(dp(54), dp(43)).apply { topMargin = dp(5) })
        overlay.addView(right, FrameLayout.LayoutParams(dp(66), -2, Gravity.END or Gravity.CENTER_VERTICAL).apply {
            rightMargin = dp(9)
        })

        // Two compact always-visible sliders; dynamic controls use real CameraX values.
        val sliders = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = rounded(Color.argb(214, 13, 18, 25))
            setPadding(dp(8), dp(2), dp(8), dp(2))
        }
        zoomValue = label("1.0×", 12f)
        sliders.addView(label("ZOOM ", 10f, dim))
        sliders.addView(zoomValue)
        zoomSeek = SeekBar(this).apply {
            max = 1000
            isEnabled = false
            progressTintList = android.content.res.ColorStateList.valueOf(green)
            thumbTintList = android.content.res.ColorStateList.valueOf(green)
        }
        sliders.addView(zoomSeek, LinearLayout.LayoutParams(0, dp(32), 1f))
        evValue = label("0 EV", 12f)
        sliders.addView(label("EV ", 10f, dim))
        sliders.addView(evValue)
        evSeek = SeekBar(this).apply {
            max = 100
            isEnabled = false
            progressTintList = android.content.res.ColorStateList.valueOf(green)
            thumbTintList = android.content.res.ColorStateList.valueOf(green)
        }
        sliders.addView(evSeek, LinearLayout.LayoutParams(0, dp(32), 1f))
        overlay.addView(sliders, FrameLayout.LayoutParams(-1, dp(42), Gravity.BOTTOM).apply {
            bottomMargin = dp(56); leftMargin = dp(79); rightMargin = dp(79)
        })

        zoomSeek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(s: SeekBar?, progress: Int, fromUser: Boolean) {
                if (!fromUser) return
                camera?.cameraInfo?.zoomState?.value?.let { state ->
                    val ratio = state.minZoomRatio +
                        (state.maxZoomRatio - state.minZoomRatio) * progress / 1000f
                    camera?.cameraControl?.setZoomRatio(ratio)
                }
            }
            override fun onStartTrackingTouch(s: SeekBar?) {}
            override fun onStopTrackingTouch(s: SeekBar?) {}
        })
        evSeek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(s: SeekBar?, progress: Int, fromUser: Boolean) {
                if (!fromUser) return
                camera?.cameraInfo?.exposureState?.let { state ->
                    val range = state.exposureCompensationRange
                    if (range.lower < range.upper) {
                        val index = range.lower + ((range.upper - range.lower) * progress / 100f).roundToInt()
                        camera?.cameraControl?.setExposureCompensationIndex(index)
                        evValue.text = String.format("%.1f EV", index * state.exposureCompensationStep.toFloat())
                    }
                }
            }
            override fun onStartTrackingTouch(s: SeekBar?) {}
            override fun onStopTrackingTouch(s: SeekBar?) {}
        })

        val bottom = floatingBar()
        fun addChip(text: String, weight: Float = 1f, action: (View) -> Unit) {
            val chip = button(text) {}
            chip.setOnClickListener { action(it) }
            bottom.addView(chip, LinearLayout.LayoutParams(0, dp(42), weight).apply {
                leftMargin = dp(3)
            })
        }
        addChip("ISO Auto") { infoPopup(it, "ISO manual", listOf("ISO 100", "ISO 200", "ISO 400", "ISO 800", "ISO 1600")) }
        addChip("SH Auto") { infoPopup(it, "Obturador manual", listOf("1/30", "1/60", "1/125", "1/250")) }
        addChip("WB Auto") { infoPopup(it, "WB manual", listOf("3200 K", "4500 K", "5600 K", "6500 K")) }
        addChip("AF") { Toast.makeText(this, "Toque na imagem para focar", Toast.LENGTH_SHORT).show() }
        addChip("FPS Auto") { unavailable("Seleção 1080p 30/60") }
        addChip("STREAM OFF", 1.3f) { unavailable("Transmissão ao Windows") }
        overlay.addView(bottom, FrameLayout.LayoutParams(-1, dp(52), Gravity.BOTTOM).apply {
            leftMargin = dp(6); rightMargin = dp(6); bottomMargin = dp(5)
        })

        setContentView(root)
    }

    private fun openConnectionDialog() {
        val fields = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(10), dp(20), 0)
        }
        fun field(hintText: String) = EditText(this).also {
            it.hint = hintText
            it.setSingleLine(true)
            fields.addView(it)
        }
        val url = field("wss://servidor/tally")
        val id = field("ID câmera: cam-01")
        val token = field("Token de pareamento").apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        android.app.AlertDialog.Builder(this)
            .setTitle("Conectar Tally")
            .setView(fields)
            .setPositiveButton("Conectar") { _, _ ->
                try {
                    client.connect(url.text.toString().trim(), id.text.toString().trim(), token.text.toString())
                } catch (ex: Exception) {
                    Toast.makeText(this, ex.message ?: "Erro de conexão", Toast.LENGTH_LONG).show()
                }
            }
            .setNeutralButton("Desconectar") { _, _ -> client.disconnect() }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            try {
                provider = future.get()
                bindCamera()
            } catch (ex: Exception) {
                cameraStatus.text = "Erro de câmera"
                Toast.makeText(this, "Falha ao abrir câmera: " + ex.message, Toast.LENGTH_LONG).show()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun bindCamera() {
        try {
            val p = provider ?: return
            val useCase = Preview.Builder().build()
            useCase.surfaceProvider = preview.surfaceProvider
            p.unbindAll()
            camera = p.bindToLifecycle(this, selector, useCase)
            torchEnabled = false
            cameraStatus.text = if (selector == CameraSelector.DEFAULT_BACK_CAMERA) "Câmera traseira" else "Câmera frontal"
            torchButton.isEnabled = camera?.cameraInfo?.hasFlashUnit() == true
            torchButton.alpha = if (torchButton.isEnabled) 1f else 0.4f

            camera?.cameraInfo?.zoomState?.observe(this) { state ->
                zoomValue.text = String.format("%.1f×", state.zoomRatio)
                zoomSeek.isEnabled = state.maxZoomRatio > state.minZoomRatio
                val span = state.maxZoomRatio - state.minZoomRatio
                if (span > 0f) zoomSeek.progress = ((state.zoomRatio - state.minZoomRatio) / span * 1000).roundToInt()
            }
            camera?.cameraInfo?.exposureState?.let { state ->
                val range = state.exposureCompensationRange
                evSeek.isEnabled = range.lower < range.upper
                val span = range.upper - range.lower
                if (span > 0) evSeek.progress = ((state.exposureCompensationIndex - range.lower) * 100f / span).roundToInt()
                evValue.text = String.format("%.1f EV", state.exposureCompensationIndex * state.exposureCompensationStep.toFloat())
            }
        } catch (ex: Exception) {
            cameraStatus.text = "Câmera não disponível"
            Toast.makeText(this, ex.message ?: "Câmera indisponível", Toast.LENGTH_LONG).show()
        }
    }

    private fun switchCamera() {
        selector = if (selector == CameraSelector.DEFAULT_BACK_CAMERA)
            CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
        bindCamera()
    }

    private fun toggleTorch() {
        if (camera?.cameraInfo?.hasFlashUnit() != true) return
        torchEnabled = !torchEnabled
        camera?.cameraControl?.enableTorch(torchEnabled)
        torchButton.text = if (torchEnabled) "Luz ligada" else "Lanterna"
    }

    private fun renderTally(state: String) {
        val color = when (state) {
            "PROGRAM" -> Color.rgb(235, 45, 56)
            "PREVIEW" -> green
            "STANDBY" -> Color.rgb(83, 92, 103)
            else -> Color.rgb(43, 50, 58)
        }
        tallyDot.setTextColor(color)
        frame.background = rounded(panel, color, 4)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 100 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) startCamera()
    }

    override fun onDestroy() {
        client.disconnect()
        super.onDestroy()
    }
}
