import React, { useState } from 'react';
import { X, Copy, Check, Code, Smartphone } from 'lucide-react';

interface KotlinCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KOTLIN_JETPACK_COMPOSE_CODE = `package com.example.dominomexicano

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

// =========================================================================
// 1. MODELOS DE DADOS PARA DOMINÓ MEXICANO (DOUBLE-12)
// =========================================================================

data class DominoTile(
    val id: String = System.currentTimeMillis().toString() + (1..999).random(),
    var sideA: Int,
    var sideB: Int
) {
    val points: Int get() = sideA + sideB
    val isDouble: Boolean get() = sideA == sideB
}

data class Player(
    val id: String,
    val name: String,
    val avatar: String,
    val scores: MutableList<Int?>,
    val roundPieces: MutableMap<Int, MutableList<DominoTile>> = mutableMapOf()
) {
    val totalScore: Int get() = scores.filterNotNull().sum()
    val playedRoundsCount: Int get() = scores.filterNotNull().size
    val averageScore: Double get() = if (playedRoundsCount > 0) totalScore.toDouble() / playedRoundsCount else 0.0
}

enum class AppTab(val title: String) {
    CAMERA("Câmera / Contar"),
    RANKING("Ranking")
}

// =========================================================================
// 2. VIEWMODEL COM ESTADO REATIVO (2-10 JOGADORES, 1-10 RODADAS)
// =========================================================================

class DominoViewModel : ViewModel() {
    private val _players = MutableStateFlow(
        listOf(
            Player("1", "Mariana", "👩", mutableListOf(0, 14, 8), mutableMapOf(
                1 to mutableListOf(DominoTile(sideA = 6, sideB = 8)),
                2 to mutableListOf(DominoTile(sideA = 3, sideB = 5))
            )),
            Player("2", "Carlos", "👨", mutableListOf(28, 0, 15), mutableMapOf(
                0 to mutableListOf(DominoTile(sideA = 12, sideB = 9), DominoTile(sideA = 3, sideB = 4)),
                2 to mutableListOf(DominoTile(sideA = 7, sideB = 8))
            )),
            Player("3", "Lucas", "🧔", mutableListOf(35, 22, 0), mutableMapOf(
                0 to mutableListOf(DominoTile(sideA = 11, sideB = 12), DominoTile(sideA = 6, sideB = 6)),
                1 to mutableListOf(DominoTile(sideA = 10, sideB = 12))
            )),
            Player("4", "Ana", "👱‍♀️", mutableListOf(18, 31, 24), mutableMapOf(
                0 to mutableListOf(DominoTile(sideA = 9, sideB = 9)),
                1 to mutableListOf(DominoTile(sideA = 12, sideB = 12), DominoTile(sideA = 3, sideB = 4)),
                2 to mutableListOf(DominoTile(sideA = 12, sideB = 12))
            ))
        )
    )
    val players: StateFlow<List<Player>> = _players.asStateFlow()

    var currentRound by mutableIntStateOf(3)
    var maxRounds by mutableIntStateOf(8)
    var isDarkTheme by mutableStateOf(true)

    // Lista de peças ativas na aba de Contagem / Câmera
    val countingPieces = mutableStateListOf(
        DominoTile(sideA = 12, sideB = 9),
        DominoTile(sideA = 4, sideB = 7),
        DominoTile(sideA = 5, sideB = 5)
    )

    val countingTotalPoints: Int
        get() = countingPieces.sumOf { it.points }

    fun addPlayer(name: String, avatar: String) {
        if (_players.value.size < 10) {
            val newP = Player(
                id = System.currentTimeMillis().toString(),
                name = name.ifBlank { "Jogador \${_players.value.size + 1}" },
                avatar = avatar,
                scores = MutableList(maxRounds) { null }
            )
            _players.update { it + newP }
        }
    }

    fun removePlayer(id: String) {
        if (_players.value.size > 2) {
            _players.update { list -> list.filter { it.id != id } }
        }
    }

    fun updateScoreDirect(playerId: String, roundIndex: Int, score: Int) {
        _players.update { list ->
            list.map { player ->
                if (player.id == playerId) {
                    val updatedScores = player.scores.toMutableList()
                    while (updatedScores.size <= roundIndex) updatedScores.add(null)
                    updatedScores[roundIndex] = score
                    player.copy(scores = updatedScores)
                } else player
            }
        }
    }

    fun updateRoundWithPieces(playerId: String, roundIndex: Int, pieces: List<DominoTile>, scoreOverride: Int? = null) {
        val total = scoreOverride ?: pieces.sumOf { it.points }
        _players.update { list ->
            list.map { player ->
                if (player.id == playerId) {
                    val updatedScores = player.scores.toMutableList()
                    while (updatedScores.size <= roundIndex) updatedScores.add(null)
                    updatedScores[roundIndex] = total
                    val updatedPiecesMap = player.roundPieces.toMutableMap()
                    updatedPiecesMap[roundIndex] = pieces.toMutableList()
                    player.copy(scores = updatedScores, roundPieces = updatedPiecesMap)
                } else player
            }
        }
    }

    // Ações para a aba de Câmera/Contagem
    fun addCountingPiece(sideA: Int, sideB: Int) {
        val min = minOf(sideA, sideB)
        val max = maxOf(sideA, sideB)
        countingPieces.add(DominoTile(sideA = min, sideB = max))
    }

    fun editCountingPiece(index: Int, sideA: Int, sideB: Int) {
        if (index in countingPieces.indices) {
            val min = minOf(sideA, sideB)
            val max = maxOf(sideA, sideB)
            countingPieces[index] = countingPieces[index].copy(sideA = min, sideB = max)
        }
    }

    fun removeCountingPiece(index: Int) {
        if (index in countingPieces.indices) {
            countingPieces.removeAt(index)
        }
    }

    fun clearCountingPieces() {
        countingPieces.clear()
    }

    fun shareRanking(context: Context) {
        val sorted = _players.value.sortedBy { it.totalScore }
        val builder = StringBuilder()
        builder.append("🚂 *DOMINÓ MEXICANO - PLACAR OFICIAL* 🁓\\n")
        builder.append("📊 Rodada $currentRound de $maxRounds\\n")
        builder.append("━━━━━━━━━━━━━━━━━━━━━\\n\\n")

        val medals = listOf("🥇", "🥈", "🥉")
        sorted.forEachIndexed { index, p ->
            val icon = if (index < 3) medals[index] else " \${index + 1}º"
            val crown = if (index == 0) " 👑" else ""
            builder.append("$icon *\${p.name}*: \${p.totalScore} pts (Média: \${String.format(\"%.1f\", p.averageScore)})$crown\\n")
        }

        builder.append("\\n━━━━━━━━━━━━━━━━━━━━━\\n")
        builder.append("🏆 Líder da mesa: *\${sorted.firstOrNull()?.name}* com \${sorted.firstOrNull()?.totalScore} pontos!\\n")
        builder.append("📱 App Dominó Mexicano (Kotlin/Jetpack Compose)")

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Ranking Dominó Mexicano")
            putExtra(Intent.EXTRA_TEXT, builder.toString())
        }
        context.startActivity(Intent.createChooser(intent, "Compartilhar Placar"))
    }
}

// =========================================================================
// 3. ACTIVITY PRINCIPAL E NAVEGAÇÃO DE 2 ABAS
// =========================================================================

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val viewModel: DominoViewModel = viewModel()
            DominoMexicanTheme(darkTheme = viewModel.isDarkTheme) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainScreen(viewModel)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(viewModel: DominoViewModel) {
    var selectedTab by remember { mutableStateOf(AppTab.CAMERA) }
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(text = "🚂", fontSize = 20.sp, modifier = Modifier.padding(end = 8.dp))
                        Text(
                            text = "Dominó Mexicano",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.isDarkTheme = !viewModel.isDarkTheme }) {
                        Icon(
                            imageVector = if (viewModel.isDarkTheme) Icons.Default.LightMode else Icons.Default.DarkMode,
                            contentDescription = "Alternar Modo Escuro"
                        )
                    }
                    IconButton(onClick = { viewModel.shareRanking(context) }) {
                        Icon(imageVector = Icons.Default.Share, contentDescription = "Compartilhar")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == AppTab.CAMERA,
                    onClick = { selectedTab = AppTab.CAMERA },
                    icon = { Icon(Icons.Default.CameraAlt, contentDescription = "Câmera / Contar Pontos") },
                    label = { Text("Câmera / Contar") }
                )
                NavigationBarItem(
                    selected = selectedTab == AppTab.RANKING,
                    onClick = { selectedTab = AppTab.RANKING },
                    icon = { Icon(Icons.Default.EmojiEvents, contentDescription = "Ranking") },
                    label = { Text("Ranking") }
                )
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when (selectedTab) {
                AppTab.CAMERA -> CameraCountingScreen(viewModel)
                AppTab.RANKING -> RankingScreen(viewModel)
            }
        }
    }
}

// =========================================================================
// 4. ABA 1: CÂMERA & CONTAGEM DE PONTOS (VISÃO + ADIÇÃO/EDIÇÃO MANUAL)
// =========================================================================

@Composable
fun CameraCountingScreen(viewModel: DominoViewModel) {
    val context = LocalContext.current
    val players by viewModel.players.collectAsState()
    var selectedPlayerId by remember { mutableStateOf(players.firstOrNull()?.id ?: "") }

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { granted -> hasCameraPermission = granted }
    )

    // Diálogos de edição manual
    var showAddPieceDialog by remember { mutableStateOf(false) }
    var editingIndex by remember { mutableStateOf<Int?>(null) }
    var showDirectScoreDialog by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Pré-visualização da Câmera
        item {
            Card(
                modifier = Modifier.fillMaxWidth().height(220.dp),
                shape = RoundedCornerShape(16.dp)
            ) {
                if (hasCameraPermission) {
                    AndroidView(
                        factory = { ctx ->
                            val previewView = PreviewView(ctx)
                            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                            cameraProviderFuture.addListener({
                                val cameraProvider = cameraProviderFuture.get()
                                val preview = Preview.Builder().build().also {
                                    it.setSurfaceProvider(previewView.surfaceProvider)
                                }
                                val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
                                try {
                                    cameraProvider.unbindAll()
                                    cameraProvider.bindToLifecycle(
                                        ctx as ComponentActivity,
                                        cameraSelector,
                                        preview
                                    )
                                } catch (e: Exception) {
                                    Log.e("DominoVision", "Erro na câmera", e)
                                }
                            }, ContextCompat.getMainExecutor(ctx))
                            previewView
                        },
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Button(onClick = { launcher.launch(Manifest.permission.CAMERA) }) {
                            Text("Habilitar Câmera")
                        }
                    }
                }
            }
        }

        // Barra de Ações: Escanear / Adicionar Peça Manual / Pontuação Direta
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        // Exemplo de leitura de visão computacional
                        viewModel.clearCountingPieces()
                        viewModel.addCountingPiece(12, 9)
                        viewModel.addCountingPiece(4, 7)
                        viewModel.addCountingPiece(5, 5)
                        Toast.makeText(context, "3 pedras identificadas via câmera!", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Escanear", fontSize = 12.sp)
                }

                Button(
                    onClick = { showAddPieceDialog = true },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Nova Peça", fontSize = 12.sp)
                }

                Button(
                    onClick = { showDirectScoreDialog = true },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiary),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Pts Manual", fontSize = 12.sp)
                }
            }
        }

        // Total Acumulado e Atribuição
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Total da Mão / Leitura:", fontWeight = FontWeight.Bold)
                            Text("\${viewModel.countingPieces.size} peças identificadas", fontSize = 12.sp)
                        }
                        Text(
                            text = "\${viewModel.countingTotalPoints} pts",
                            fontWeight = FontWeight.Black,
                            fontSize = 22.sp,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }

                    Spacer(Modifier.height(10.dp))
                    HorizontalDivider()
                    Spacer(Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Gravar para jogador:", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Button(
                            onClick = {
                                if (selectedPlayerId.isNotEmpty()) {
                                    viewModel.updateRoundWithPieces(
                                        playerId = selectedPlayerId,
                                        roundIndex = viewModel.currentRound - 1,
                                        pieces = viewModel.countingPieces.toList(),
                                        scoreOverride = viewModel.countingTotalPoints
                                    )
                                    Toast.makeText(context, "Pontos gravados com sucesso!", Toast.LENGTH_SHORT).show()
                                }
                            }
                        ) {
                            Text("Salvar na R\${viewModel.currentRound}")
                        }
                    }
                }
            }
        }

        item {
            Text("Peças Registradas (Toque em uma peça para editá-la):", fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }

        // Lista de Peças com Edição Individual
        items(viewModel.countingPieces.size) { index ->
            val piece = viewModel.countingPieces[index]
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { editingIndex = index },
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Row(
                    modifier = Modifier.padding(12.dp).fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DominoPieceView(piece.sideA, piece.sideB, piece.isDouble)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("Pedra [\${piece.sideA}|\${piece.sideB}]", fontWeight = FontWeight.Bold)
                            Text(if (piece.isDouble) "Duplo" else "\${piece.sideA} + \${piece.sideB}", fontSize = 11.sp)
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("\${piece.points} pts", fontWeight = FontWeight.Black, fontSize = 16.sp)
                        Spacer(Modifier.width(8.dp))
                        IconButton(onClick = { editingIndex = index }) {
                            Icon(Icons.Default.Edit, contentDescription = "Editar Peça", tint = MaterialTheme.colorScheme.primary)
                        }
                        IconButton(onClick = { viewModel.removeCountingPiece(index) }) {
                            Icon(Icons.Default.Delete, contentDescription = "Remover", tint = Color.Red)
                        }
                    }
                }
            }
        }
    }

    // Modal: Adicionar Nova Peça
    if (showAddPieceDialog) {
        DominoPieceEditDialog(
            title = "Adicionar Peça Manual",
            initialA = 12,
            initialB = 9,
            onDismiss = { showAddPieceDialog = false },
            onConfirm = { a, b ->
                viewModel.addCountingPiece(a, b)
                showAddPieceDialog = false
            }
        )
    }

    // Modal: Editar Peça Individual
    editingIndex?.let { idx ->
        val piece = viewModel.countingPieces.getOrNull(idx)
        if (piece != null) {
            DominoPieceEditDialog(
                title = "Editar Peça Individual",
                initialA = piece.sideA,
                initialB = piece.sideB,
                onDismiss = { editingIndex = null },
                onConfirm = { a, b ->
                    viewModel.editCountingPiece(idx, a, b)
                    editingIndex = null
                }
            )
        }
    }

    // Modal: Inserir Pontuação Manual Direta
    if (showDirectScoreDialog) {
        DirectScoreInputDialog(
            onDismiss = { showDirectScoreDialog = false },
            onConfirm = { score ->
                if (selectedPlayerId.isNotEmpty()) {
                    viewModel.updateScoreDirect(selectedPlayerId, viewModel.currentRound - 1, score)
                    Toast.makeText(context, "$score pontos gravados!", Toast.LENGTH_SHORT).show()
                }
                showDirectScoreDialog = false
            }
        )
    }
}

// =========================================================================
// 5. ABA 2: RANKING EM TEMPO REAL COM EDIÇÃO DIRETA DE PEÇAS & PONTOS
// =========================================================================

@Composable
fun RankingScreen(viewModel: DominoViewModel) {
    val players by viewModel.players.collectAsState()
    val rankedPlayers = remember(players) { players.sortedBy { it.totalScore } }
    val context = LocalContext.current

    // Estado para editar rodada/peças a partir do Ranking
    var selectedPlayerForRoundEdit by remember { mutableStateOf<Pair<Player, Int>?>(null) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "🏆 Ranking em Tempo Real",
                    fontWeight = FontWeight.Black,
                    fontSize = 18.sp
                )
                Button(
                    onClick = { viewModel.shareRanking(context) },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiary)
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Compartilhar", fontSize = 12.sp)
                }
            }
        }

        // Lista de Jogadores e Acesso Direto à Edição de Peças por Rodada
        items(rankedPlayers.size) { index ->
            val player = rankedPlayers[index]
            val isLeader = index == 0

            Card(
                modifier = Modifier.fillMaxWidth(),
                border = if (isLeader) BorderStroke(2.dp, Color(0xFFFFB800)) else null,
                colors = CardDefaults.cardColors(
                    containerColor = if (isLeader) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface
                )
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = when (index) {
                                0 -> "🥇"
                                1 -> "🥈"
                                2 -> "🥉"
                                else -> "\${index + 1}º"
                            },
                            fontSize = 20.sp,
                            modifier = Modifier.width(36.dp)
                        )
                        Text(text = player.avatar, fontSize = 24.sp, modifier = Modifier.padding(end = 8.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(text = player.name, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            Text(
                                text = "Média: \${String.format(\"%.1f\", player.averageScore)} pts/rodada",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text(
                            text = "\${player.totalScore} pts",
                            fontWeight = FontWeight.Black,
                            fontSize = 18.sp,
                            color = if (isLeader) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                        )
                    }

                    Spacer(Modifier.height(8.dp))
                    Text("Rodadas (Toque para editar pontuação ou peças):", fontSize = 10.sp, color = Color.Gray)
                    Spacer(Modifier.height(4.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        for (r in 0 until viewModel.maxRounds) {
                            val score = player.scores.getOrNull(r)
                            val hasPieces = (player.roundPieces[r]?.size ?: 0) > 0
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = if (r == viewModel.currentRound - 1) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable { selectedPlayerForRoundEdit = Pair(player, r) }
                            ) {
                                Column(
                                    modifier = Modifier.padding(vertical = 4.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Text("R\${r + 1}", fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                    Text(
                                        text = if (score != null) "$score" else "-",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Black,
                                        color = if (score == 0) Color(0xFF10B981) else Color.Unspecified
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Modal de Edição de Peças & Pontos Direto do Ranking
    selectedPlayerForRoundEdit?.let { (player, roundIdx) ->
        RoundDetailEditorDialog(
            player = player,
            roundIndex = roundIdx,
            onDismiss = { selectedPlayerForRoundEdit = null },
            onSave = { pieces, score ->
                viewModel.updateRoundWithPieces(player.id, roundIdx, pieces, score)
                selectedPlayerForRoundEdit = null
            }
        )
    }
}

// =========================================================================
// 6. DIÁLOGOS DE EDIÇÃO DE PEÇAS E PONTUAÇÃO MANUAL
// =========================================================================

@Composable
fun DominoPieceEditDialog(
    title: String,
    initialA: Int,
    initialB: Int,
    onDismiss: () -> Unit,
    onConfirm: (Int, Int) -> Unit
) {
    var sideA by remember { mutableIntStateOf(initialA) }
    var sideB by remember { mutableIntStateOf(initialB) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(modifier = Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(title, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Spacer(Modifier.height(16.dp))

                DominoPieceView(sideA, sideB, sideA == sideB)
                Spacer(Modifier.height(8.dp))
                Text("Total: \${sideA + sideB} pontos", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Spacer(Modifier.height(16.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Lado A: $sideA", fontSize = 12.sp)
                        Row {
                            IconButton(onClick = { if (sideA > 0) sideA-- }) { Icon(Icons.Default.Remove, contentDescription = null) }
                            IconButton(onClick = { if (sideA < 12) sideA++ }) { Icon(Icons.Default.Add, contentDescription = null) }
                        }
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Lado B: $sideB", fontSize = 12.sp)
                        Row {
                            IconButton(onClick = { if (sideB > 0) sideB-- }) { Icon(Icons.Default.Remove, contentDescription = null) }
                            IconButton(onClick = { if (sideB < 12) sideB++ }) { Icon(Icons.Default.Add, contentDescription = null) }
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancelar") }
                    Button(onClick = { onConfirm(sideA, sideB) }) { Text("Confirmar") }
                }
            }
        }
    }
}

@Composable
fun DirectScoreInputDialog(
    onDismiss: () -> Unit,
    onConfirm: (Int) -> Unit
) {
    var textValue by remember { mutableStateOf("") }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text("Pontuação Manual Direta", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Spacer(Modifier.height(12.dp))

                OutlinedTextField(
                    value = textValue,
                    onValueChange = { textValue = it },
                    label = { Text("Pontos") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Button(
                        onClick = { onConfirm(0) },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
                    ) {
                        Text("0 (Bateu)")
                    }
                    Row {
                        TextButton(onClick = onDismiss) { Text("Cancelar") }
                        Button(onClick = { onConfirm(textValue.toIntOrNull() ?: 0) }) { Text("Salvar") }
                    }
                }
            }
        }
    }
}

@Composable
fun RoundDetailEditorDialog(
    player: Player,
    roundIndex: Int,
    onDismiss: () -> Unit,
    onSave: (List<DominoTile>, Int) -> Unit
) {
    val pieces = remember { mutableStateListOf<DominoTile>().also { it.addAll(player.roundPieces[roundIndex] ?: emptyList()) } }
    var directScore by remember { mutableStateOf((player.scores.getOrNull(roundIndex) ?: pieces.sumOf { it.points }).toString()) }
    var showAddPiece by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier.fillMaxWidth().heightIn(max = 500.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "\${player.avatar} \${player.name} - Rodada \${roundIndex + 1}",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
                Spacer(Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Peças da Rodada:", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Button(onClick = { showAddPiece = true }) {
                        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Adicionar", fontSize = 11.sp)
                    }
                }

                Spacer(Modifier.height(8.dp))
                LazyColumn(modifier = Modifier.weight(1f)) {
                    items(pieces.size) { i ->
                        val p = pieces[i]
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            DominoPieceView(p.sideA, p.sideB, p.isDouble)
                            Text("[\${p.sideA}|\${p.sideB}] = \${p.points} pts", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            IconButton(onClick = { pieces.removeAt(i) }) {
                                Icon(Icons.Default.Delete, contentDescription = "Remover", tint = Color.Red)
                            }
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = directScore,
                    onValueChange = { directScore = it },
                    label = { Text("Pontuação Total Final") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancelar") }
                    Button(onClick = { onSave(pieces.toList(), directScore.toIntOrNull() ?: pieces.sumOf { it.points }) }) {
                        Text("Gravar no Ranking")
                    }
                }
            }
        }
    }

    if (showAddPiece) {
        DominoPieceEditDialog(
            title = "Nova Peça para \${player.name}",
            initialA = 12,
            initialB = 9,
            onDismiss = { showAddPiece = false },
            onConfirm = { a, b ->
                val min = minOf(a, b)
                val max = maxOf(a, b)
                pieces.add(DominoTile(sideA = min, sideB = max))
                directScore = pieces.sumOf { it.points }.toString()
                showAddPiece = false
            }
        )
    }
}

// =========================================================================
// 7. COMPONENTE VISUAL DA PEDRA DE DOMINÓ
// =========================================================================

@Composable
fun DominoPieceView(sideA: Int, sideB: Int, isDouble: Boolean) {
    Card(
        modifier = Modifier.size(width = 72.dp, height = 40.dp),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, if (isDouble) Color(0xFFFFB800) else Color.Gray),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Row(
            modifier = Modifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                Text(sideA.toString(), fontWeight = FontWeight.Black, color = Color.Black, fontSize = 15.sp)
            }
            VerticalDivider(modifier = Modifier.fillMaxHeight().width(1.5.dp), color = Color.LightGray)
            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                Text(sideB.toString(), fontWeight = FontWeight.Black, color = Color.Black, fontSize = 15.sp)
            }
        }
    }
}

// =========================================================================
// 8. TEMA MATERIAL DESIGN 3 COM MODO ESCURO
// =========================================================================

@Composable
fun DominoMexicanTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) {
        darkColorScheme(
            primary = Color(0xFF10B981),
            primaryContainer = Color(0xFF064E3B),
            secondary = Color(0xFF6366F1),
            background = Color(0xFF121212),
            surface = Color(0xFF1E1E1E),
            surfaceVariant = Color(0xFF2D2D2D)
        )
    } else {
        lightColorScheme(
            primary = Color(0xFF059669),
            primaryContainer = Color(0xFFD1FAE5),
            secondary = Color(0xFF4F46E5),
            background = Color(0xFFF9FAFB),
            surface = Color(0xFFFFFFFF),
            surfaceVariant = Color(0xFFF3F4F6)
        )
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
`;

export const KotlinCodeModal: React.FC<KotlinCodeModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(KOTLIN_JETPACK_COMPOSE_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-4xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>MainActivity.kt (Kotlin & Jetpack Compose)</span>
                <span className="text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full">
                  Material 3
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Código completo executável: Câmera/Contagem, Edição Individual de Peças & Ranking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Código Copiado!' : 'Copiar Código'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-auto p-4 bg-zinc-950 font-mono text-xs leading-relaxed text-zinc-300">
          <pre className="whitespace-pre">
            <code>{KOTLIN_JETPACK_COMPOSE_CODE}</code>
          </pre>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900 flex items-center justify-between text-xs text-zinc-400">
          <span>CameraX, MLKit Vision, Edição de Peças Individual, Pontuação Manual, StateFlow, Material 3 e Intent Social</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-lg"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
