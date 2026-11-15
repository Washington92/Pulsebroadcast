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

    private fun buildConsole() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(bg)
            setPadding(dp(10), dp(6), dp(10), dp(6))
        }

        val header = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            orientation = LinearLayout.HORIZONTAL
        }
        header.addView(label("wMix  Camera", 19f).apply { setTypeface(null, Typeface.BOLD) },
            LinearLayout.LayoutParams(0, dp(38), 1f))
        header.addView(label("CAM 01", 12f, dim), LinearLayout.LayoutParams(dp(70), dp(38)))
        tallyDot = label("●", 24f, dim)
        header.addView(tallyDot, LinearLayout.LayoutParams(dp(36), dp(38)))
        header.addView(button("Conexão") { openConnectionDialog() },
            LinearLayout.LayoutParams(dp(95), dp(36)))
        root.addView(header)

        val main = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        frame = FrameLayout(this).apply {
            setPadding(dp(4), dp(4), dp(4), dp(4))
            background = rounded(panel, Color.DKGRAY, 3)
        }
        preview = PreviewView(this).apply { scaleType = PreviewView.ScaleType.FIT_CENTER }
        frame.addView(preview, FrameLayout.LayoutParams(-1, -1))
        preview.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_UP) {
                val point = preview.meteringPointFactory.createPoint(event.x, event.y)
                camera?.cameraControl?.startFocusAndMetering(
                    FocusMeteringAction.Builder(point).build()
                )
                cameraStatus.text = "Foco por toque"
                true
            } else true
        }
        main.addView(frame, LinearLayout.LayoutParams(0, -1, 1.65f))

        val controlsScroll = ScrollView(this).apply { isFillViewport = true }
        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(9), 0, 0, 0)
        }

        cameraStatus = label("Aguardando câmera", 12f, dim)
        controls.addView(cameraStatus)

        val zoomPanel = section("ZOOM")
        zoomValue = label("1.0×", 18f)
        zoomPanel.addView(zoomValue)
        zoomSeek = SeekBar(this).apply {
            max = 1000
            isEnabled = false
            progressTintList = android.content.res.ColorStateList.valueOf(green)
            thumbTintList = android.content.res.ColorStateList.valueOf(green)
        }
        zoomPanel.addView(zoomSeek)
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
        controls.addView(zoomPanel, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(7) })

        val evPanel = section("EXPOSIÇÃO EV")
        evValue = label("0 EV", 18f)
        evPanel.addView(evValue)
        evSeek = SeekBar(this).apply {
            max = 100
            isEnabled = false
            progressTintList = android.content.res.ColorStateList.valueOf(green)
            thumbTintList = android.content.res.ColorStateList.valueOf(green)
        }
        evPanel.addView(evSeek)
        evSeek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(s: SeekBar?, progress: Int, fromUser: Boolean) {
                if (!fromUser) return
                camera?.cameraInfo?.exposureState?.let { state ->
                    val range = state.exposureCompensationRange
                    if (range.lower <= range.upper) {
                        val index = range.lower + ((range.upper - range.lower) * progress / 100f).roundToInt()
                        camera?.cameraControl?.setExposureCompensationIndex(index)
                        evValue.text = String.format("%.1f EV", index * state.exposureCompensationStep.toFloat())
                    }
                }
            }
            override fun onStartTrackingTouch(s: SeekBar?) {}
            override fun onStopTrackingTouch(s: SeekBar?) {}
        })
        controls.addView(evPanel, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(7) })

        val focusPanel = section("FOCO")
        focusPanel.addView(label("AF contínuo • toque na imagem para focar", 12f))
        controls.addView(focusPanel, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(7) })

        val tools = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        lensButton = button("Trocar câmera") { switchCamera() }
        tools.addView(lensButton, LinearLayout.LayoutParams(0, dp(44), 1f))
        torchButton = button("Lanterna") { toggleTorch() }
        tools.addView(torchButton, LinearLayout.LayoutParams(0, dp(44), 1f).apply { leftMargin = dp(5) })
        controls.addView(tools)

        val readout = section("PARÂMETROS")
        readout.addView(label("FPS: automático • resolução: perfil padrão", 12f))
        readout.addView(label("ISO / shutter / WB / histograma: em desenvolvimento", 11f, dim))
        readout.addView(label("Áudio / streaming: ainda não disponíveis", 11f, dim))
        controls.addView(readout, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(7) })

        controlsScroll.addView(controls)
        main.addView(controlsScroll, LinearLayout.LayoutParams(0, -1, 1f))
        root.addView(main, LinearLayout.LayoutParams(-1, 0, 1f))

        val footer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        footer.addView(label("Tally: borda verde = Preview | vermelha = Program", 11f, dim),
            LinearLayout.LayoutParams(0, dp(35), 1f))
        footer.addView(label("Transmissão: OFF", 12f, dim))
        root.addView(footer)
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
