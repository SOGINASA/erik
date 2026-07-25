package kz.beastinside.erik

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import kz.beastinside.erik.databinding.ActivityMainBinding
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var webView: WebView

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var cameraImageUri: Uri? = null
    private var pendingPermissionRequest: PermissionRequest? = null

    private val baseUrl: String by lazy { getString(R.string.base_url) }

    // --- File chooser (input type=file / camera capture) ---
    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            handleFileChooserResult(result)
        }

    // --- Camera runtime permission requested from a WebView PermissionRequest (getUserMedia) ---
    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val req = pendingPermissionRequest
            pendingPermissionRequest = null
            if (req == null) return@registerForActivityResult
            if (granted) {
                req.grant(req.resources)
            } else {
                req.deny()
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        webView = binding.webView
        configureWebView()

        binding.swipeRefresh.setOnRefreshListener { webView.reload() }
        binding.retryButton.setOnClickListener {
            binding.errorView.visibility = android.view.View.GONE
            webView.loadUrl(baseUrl)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl(baseUrl)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            allowContentAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            userAgentString = "$userAgentString ErikApp/1.0"
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.webViewClient = ErikWebViewClient()
        webView.webChromeClient = ErikWebChromeClient()
    }

    private inner class ErikWebViewClient : WebViewClient() {

        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest
        ): Boolean {
            val url = request.url
            val scheme = url.scheme?.lowercase() ?: return false

            // Keep http/https that belong to our host inside the WebView.
            if (scheme == "http" || scheme == "https") {
                return if (isInternalHost(url.host)) {
                    false
                } else {
                    openExternally(url)
                    true
                }
            }

            // mailto:, tel:, intent:, geo:, etc. -> hand off to the system.
            openExternally(url)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            binding.progressBar.visibility = android.view.View.VISIBLE
        }

        override fun onPageFinished(view: WebView, url: String?) {
            binding.progressBar.visibility = android.view.View.GONE
            binding.swipeRefresh.isRefreshing = false
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError
        ) {
            if (request.isForMainFrame) {
                showErrorView()
            }
        }

        override fun onReceivedSslError(
            view: WebView,
            handler: SslErrorHandler,
            error: SslError
        ) {
            // Do not bypass certificate errors.
            handler.cancel()
        }
    }

    private inner class ErikWebChromeClient : WebChromeClient() {

        override fun onProgressChanged(view: WebView, newProgress: Int) {
            binding.progressBar.progress = newProgress
            if (newProgress >= 100) {
                binding.progressBar.visibility = android.view.View.GONE
            }
        }

        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread {
                val wantsCamera = request.resources.any {
                    it == PermissionRequest.RESOURCE_VIDEO_CAPTURE
                }
                if (wantsCamera) {
                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.CAMERA
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        request.grant(request.resources)
                    } else {
                        pendingPermissionRequest = request
                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                } else {
                    request.grant(request.resources)
                }
            }
        }

        override fun onGeolocationPermissionsShowPrompt(
            origin: String?,
            callback: GeolocationPermissions.Callback?
        ) {
            callback?.invoke(origin, true, false)
        }

        override fun onShowFileChooser(
            webView: WebView,
            callback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams
        ): Boolean {
            filePathCallback?.onReceiveValue(null)
            filePathCallback = callback

            val contentIntent = fileChooserParams.createIntent().apply {
                if (fileChooserParams.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
            }

            val cameraIntent = createCameraIntent()

            val chooser = Intent(Intent.ACTION_CHOOSER).apply {
                putExtra(Intent.EXTRA_INTENT, contentIntent)
                putExtra(Intent.EXTRA_TITLE, "Выберите файл")
                if (cameraIntent != null) {
                    putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
                }
            }

            return try {
                fileChooserLauncher.launch(chooser)
                true
            } catch (e: ActivityNotFoundException) {
                filePathCallback = null
                false
            }
        }
    }

    private fun createCameraIntent(): Intent? {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return null
        }
        val takePicture = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        if (takePicture.resolveActivity(packageManager) == null) return null
        return try {
            val imageFile = File.createTempFile("erik_capture_", ".jpg", cacheDir)
            val uri = FileProvider.getUriForFile(
                this,
                "$packageName.fileprovider",
                imageFile
            )
            cameraImageUri = uri
            takePicture.putExtra(MediaStore.EXTRA_OUTPUT, uri)
            takePicture.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            takePicture
        } catch (e: Exception) {
            null
        }
    }

    private fun handleFileChooserResult(result: ActivityResult) {
        val callback = filePathCallback ?: return
        filePathCallback = null

        var results: Array<Uri>? = null
        if (result.resultCode == RESULT_OK) {
            val data = result.data
            val dataString = data?.dataString
            val clipData = data?.clipData
            when {
                clipData != null -> {
                    results = Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
                }
                dataString != null -> {
                    results = arrayOf(Uri.parse(dataString))
                }
                cameraImageUri != null -> {
                    results = arrayOf(cameraImageUri!!)
                }
            }
        }
        callback.onReceiveValue(results)
        cameraImageUri = null
    }

    private fun isInternalHost(host: String?): Boolean {
        if (host == null) return false
        val baseHost = Uri.parse(baseUrl).host ?: return false
        return host.equals(baseHost, ignoreCase = true) ||
            host.endsWith(".$baseHost", ignoreCase = true)
    }

    private fun openExternally(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (e: ActivityNotFoundException) {
            // No app can handle it; ignore silently.
        }
    }

    private fun showErrorView() {
        binding.progressBar.visibility = android.view.View.GONE
        binding.swipeRefresh.isRefreshing = false
        binding.errorView.visibility = android.view.View.VISIBLE
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
